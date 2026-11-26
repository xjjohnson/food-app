import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { addDays, enough, finishBatchChanges, isDate, loadBatchDetail, loadRecipes, needed, shortages, startBatchChange, suggestBatchNumber } from '../lib/production';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

/** Flour, sugar, a cookie recipe that makes 48, and 5 kg of flour in stock. */
function stocked(odoo: FakeOdoo) {
  const flour = odoo.create('product.product', { name: 'Flour', free_qty: 5 });
  const sugar = odoo.create('product.product', { name: 'Sugar', free_qty: 100 });
  const cookie = odoo.create('product.product', { name: 'Chocolate chip cookies', free_qty: 0, expiration_time: 14 });
  const bom = odoo.create('mrp.bom', { product_tmpl_id: [1, 'Chocolate chip cookies'], product_id: [cookie, 'Chocolate chip cookies'], product_qty: 48, product_uom_id: [1, 'Units'], type: 'normal', bom_line_ids: [] });
  const l1 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [flour, 'Flour'], product_qty: 3 });
  const l2 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [sugar, 'Sugar'], product_qty: 1 });
  odoo.tables['mrp.bom']![0]!.bom_line_ids = [l1, l2];
  return { flour, sugar, cookie, bom };
}

async function client(odoo: FakeOdoo, login: string) {
  return OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login }, 'key');
}

describe('production lib', () => {
  test('reads recipes and scales the ingredients; flags short ones', async () => {
    const { odoo } = bakery();
    const s = stocked(odoo);
    const [r] = await loadRecipes(await client(odoo, 'baker@example.com'));
    expect(r!.name).toBe('Chocolate chip cookies');
    expect(r!.lines.map((l) => l.qty)).toEqual([3, 1]);
    // 96 cookies = double: 6 flour needed, only 5 in stock.
    expect(shortages(r!, 96, { [s.flour]: 5, [s.sugar]: 100 })).toEqual([{ name: 'Flour', needed: 6, have: 5 }]);
    expect(shortages(r!, 48, { [s.flour]: 5, [s.sugar]: 100 })).toEqual([]);
  });

  test('starting a batch makes the order and confirms it, once, even when retried', async () => {
    const { odoo } = bakery();
    const s = stocked(odoo);
    const c = await client(odoo, 'baker@example.com');
    const [r] = await loadRecipes(c);
    const change = startBatchChange(r!, 96);
    // First try got there, but the phone never heard back.
    await AsyncStorage.clear();
    odoo.offline = false;
    await c.call(change.model, change.method, change.args);
    expect(odoo.tables['mrp.production']).toHaveLength(1);
    await saveOrQueue(null, AsyncStorage, DB, 1, change);
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(1);
    expect(odoo.tables['mrp.production']).toHaveLength(1);
    const mo = odoo.tables['mrp.production']![0]!;
    expect(mo.state).toBe('confirmed');
    expect(mo.product_id).toEqual([s.cookie, 'Product']);
    const d = await loadBatchDetail(c, mo.id);
    expect(d!.ingredients.map((i) => [i.name === '' ? '' : i.name, i.state])).toHaveLength(2);
    expect(d!.canRecordLot).toBe(true);
  });

  test('finishing records the batch number and use-by date, then marks done', async () => {
    const { odoo } = bakery();
    const s = stocked(odoo);
    const c = await client(odoo, 'baker@example.com');
    const [r] = await loadRecipes(c);
    await saveOrQueue(c, AsyncStorage, DB, 1, startBatchChange(r!, 48));
    const mo = odoo.tables['mrp.production']![0]!;
    for (const ch of finishBatchChanges({ id: mo.id, name: String(mo.name), productId: s.cookie, qty: 48 }, 'B-1', '2026-12-09')) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(mo.state).toBe('done');
    const lot = odoo.tables['stock.lot']![0]!;
    expect(lot).toMatchObject({ name: 'B-1', expiration_date: '2026-12-09 12:00:00' });
    expect((await loadBatchDetail(c, mo.id))!.lots[0]).toMatchObject({ name: 'B-1', useBy: '2026-12-09' });
  });

  test('without signal the finish waits in order, and sends later', async () => {
    const { odoo } = bakery();
    const s = stocked(odoo);
    const c = await client(odoo, 'baker@example.com');
    const [r] = await loadRecipes(c);
    await saveOrQueue(c, AsyncStorage, DB, 1, startBatchChange(r!, 48));
    const mo = odoo.tables['mrp.production']![0]!;
    odoo.offline = true;
    for (const ch of finishBatchChanges({ id: mo.id, name: String(mo.name), productId: s.cookie, qty: 48 }, 'B-2', '2026-12-09')) expect((await saveOrQueue(c, AsyncStorage, DB, 1, ch)).status).toBe('queued');
    expect(await loadQueue(AsyncStorage)).toHaveLength(2);
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(2);
    expect(mo.state).toBe('done');
  });

  test('small helpers', () => {
    expect(isDate('2026-12-09')).toBe(true);
    expect(isDate('2026-02-31')).toBe(false);
    expect(isDate('12/09/2026')).toBe(false);
    expect(addDays(new Date(2026, 10, 25), 14)).toBe('2026-12-09');
    expect(suggestBatchNumber('WH/MO/00004', new Date(2026, 10, 25))).toBe('261125-4');
  });
});

describe('production screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('a baker starts a batch with a short-ingredient warning, and finishes it', async () => {
    const fake = bakery();
    const odoo = fake.odoo;
    const s = stocked(odoo);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'baker@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/production' });
    await settle();
    await fireEvent.press(screen.getByTestId('start-batch'));
    await settle();
    await fireEvent.press(screen.getByTestId(`recipe-${odoo.tables['mrp.bom']![0]!.id}`));
    await settle();
    await fireEvent.changeText(screen.getByTestId('batch-qty'), '96');
    await settle();
    expect(screen.getByTestId('short-warning')).toHaveTextContent(/Flour: need 6, have 5/);
    await fireEvent.press(screen.getByTestId('confirm-start'));
    await settle();
    const mo = odoo.tables['mrp.production']![0]!;
    expect(mo.state).toBe('confirmed');
    // Starting opens the new batch right away.
    expect(screen.getByTestId('batch-state')).toHaveTextContent(/Planned \(Odoo: Confirmed\)/);
    expect(screen.getByText(/Batch started/)).toBeTruthy();
    expect(screen.getByTestId('batch-short')).toHaveTextContent(/Flour/);
    expect(screen.getByTestId('use-by').props.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await fireEvent.changeText(screen.getByTestId('lot-name'), 'CC-1');
    await fireEvent.changeText(screen.getByTestId('use-by'), '2026-12-20');
    await fireEvent.press(screen.getByTestId('finish-batch'));
    await settle();
    expect(mo.state).toBe('done');
    expect(odoo.tables['stock.lot']![0]).toMatchObject({ name: 'CC-1', product_id: s.cookie });
  });
});

describe('start batch shows the recipe with units', () => {
  test('units, recipe order, recipe and batch amounts, and need versus have', async () => {
    const { odoo } = bakery();
    const s = stocked(odoo);
    odoo.tables['uom.uom'] = [{ id: 7, name: 'lb' }];
    for (const l of odoo.tables['mrp.bom.line']!) l.product_uom_id = [7, 'lb'];
    const c = await client(odoo, 'baker@example.com');
    const [r] = await loadRecipes(c);
    expect(r!.lines.map((l) => l.unit)).toEqual(['lb', 'lb']);
    const lines = needed(r!, 96);
    expect(lines.map((l) => [l.name, l.recipeQty, l.qty])).toEqual([['Flour', 3, 6], ['Sugar', 1, 2]]);
    const out = shortages(r!, 96, { [s.flour]: 5, [s.sugar]: 100 }, { [s.flour]: 'kg', [s.sugar]: 'lb' });
    expect(out).toEqual([{ name: 'Flour', needed: 6, have: 5, unit: 'lb', haveUnit: 'kg' }]);
    expect(enough(r!, 96, { [s.flour]: 5, [s.sugar]: 100 })).toEqual(['Sugar']);
  });
});
