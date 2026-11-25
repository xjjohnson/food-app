import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { BATCH_PARTS, blankRow, loadRows, PACKAGINGS, PO_LINES, rowChanges, rowProblems } from '../lib/subRecords';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
};

function pantry(odoo: FakeOdoo) {
  odoo.tables['uom.uom'] = [{ id: 1, name: 'Units' }, { id: 2, name: 'g' }];
  const flour = odoo.create('product.product', { name: 'Flour', uom_id: [2, 'g'] });
  const sugar = odoo.create('product.product', { name: 'Sugar', uom_id: [2, 'g'] });
  odoo.declared['purchase.order.line'] = ['order_id', 'product_id', 'product_qty', 'product_uom_id', 'price_unit'];
  odoo.declared['product.packaging'] = ['product_id', 'name', 'qty', 'barcode'];
  odoo.declared['stock.move'] = ['product_id', 'product_uom_qty', 'product_uom', 'raw_material_production_id'];
  return { flour, sugar };
}

describe('lines of a record', () => {
  test('order lines: change, remove and add are sent as separate small changes', async () => {
    const { odoo } = bakery();
    const k = pantry(odoo);
    const c = await client(odoo);
    const po = odoo.create('purchase.order', { name: 'P1', state: 'draft' });
    odoo.create('purchase.order.line', { order_id: [po, 'P1'], product_id: [k.flour, 'Flour'], product_qty: 5, product_uom_id: [2, 'g'], price_unit: 2 });
    const s2 = odoo.create('purchase.order.line', { order_id: [po, 'P1'], product_id: [k.sugar, 'Sugar'], product_qty: 1, product_uom_id: [2, 'g'], price_unit: 3 });
    const before = await loadRows(c, PO_LINES, [['order_id', '=', po]]);
    expect(before.map((r) => r.id)).toHaveLength(2);
    expect(rowChanges(PO_LINES, before, before.map((r) => ({ ...r, draft: { ...r.draft } })), 'Order', { order_id: po })).toEqual([]);
    const draft = before.filter((r) => r.id !== s2).map((r) => ({ ...r, draft: { ...r.draft, product_qty: '8', price_unit: '2.5' } }));
    const add = blankRow(PO_LINES);
    add.draft = { ...add.draft, product_id: { id: k.sugar, name: 'Sugar' }, product_qty: '3', product_uom_id: { id: 2, name: 'g' }, price_unit: '4' };
    const changes = rowChanges(PO_LINES, before, [...draft, add], 'Order', { order_id: po });
    expect(changes.map((x) => x.method)).toEqual(['unlink', 'write', 'create']);
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    const after = odoo.tables['purchase.order.line']!;
    expect(after).toHaveLength(2);
    expect(after.find((l) => l.product_qty === 8)).toMatchObject({ price_unit: 2.5 });
    expect(after.find((l) => l.product_qty === 3)).toMatchObject({ order_id: po, price_unit: 4 });
  });

  test('a production batch part is added through the batch, and sent once after offline', async () => {
    const { odoo } = bakery();
    const k = pantry(odoo);
    const c = await client(odoo);
    const mo = odoo.create('mrp.production', { name: 'MO/1', state: 'confirmed', product_qty: 1, move_raw_ids: [] });
    const add = blankRow(BATCH_PARTS);
    add.draft = { ...add.draft, product_id: { id: k.sugar, name: 'Sugar' }, product_uom_qty: '40', product_uom: { id: 2, name: 'g' } };
    const [ch] = rowChanges(BATCH_PARTS, [], [add], 'Batch MO/1', { raw_material_production_id: mo }, (vals) => ({ model: 'mrp.production', method: 'write', args: [[mo], { move_raw_ids: [[0, 0, vals]] }] }));
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, ch!)).status).toBe('queued');
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['stock.move']!.filter((m) => m.raw_material_production_id === mo)).toHaveLength(1);
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
  });

  test('packagings and problems', async () => {
    const { odoo } = bakery();
    const k = pantry(odoo);
    const c = await client(odoo);
    const row = blankRow(PACKAGINGS);
    expect(rowProblems(PACKAGINGS, [row]).join(' ')).toMatch(/Name is needed.*Contained quantity is needed/);
    row.draft = { ...row.draft, name: 'Pack of 6', qty: '6' };
    for (const ch of rowChanges(PACKAGINGS, [], [row], 'Packaging', { product_id: k.flour })) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(odoo.tables['product.packaging']![0]).toMatchObject({ name: 'Pack of 6', qty: 6, product_id: [k.flour, 'Flour'] });
  });
});

describe('order lines screen', () => {
  test('a buyer opens an order, changes a quantity and a price, and saves once', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const k = pantry(odoo);
    odoo.addEmployee('Ivy', odoo.addUser({ login: 'inv@example.com' }).id, ['Inventory']);
    odoo.declared['purchase.order'] = ['partner_id', 'partner_ref', 'date_order', 'date_planned', 'notes', 'origin'];
    const po = odoo.create('purchase.order', { name: 'P00009', partner_id: [5, 'HEB'], state: 'draft', date_order: '2026-11-20 10:00:00' });
    const l = odoo.create('purchase.order.line', { order_id: [po, 'P00009'], product_id: [k.flour, 'Flour'], product_qty: 5, product_uom_id: [2, 'g'], price_unit: 2 });
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'inv@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    await renderRouter('src/app', { initialUrl: '/area/ingredients' });
    await settle();
    await fireEvent.press(screen.getByTestId('ing-pos'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`po-${po}`));
    await settle();
    await fireEvent.press(await screen.findByTestId('form-tabs-lines'));
    await fireEvent.press(screen.getByTestId('po-lines'));
    await settle();
    await fireEvent.changeText(await screen.findByTestId('f-product_qty'), '9');
    await fireEvent.changeText(screen.getByTestId('f-price_unit'), '2.75');
    await fireEvent.press(screen.getByTestId('sub-save'));
    await settle();
    expect(odoo.tables['purchase.order.line']!.find((x) => x.id === l)).toMatchObject({ product_qty: 9, price_unit: 2.75 });
  });
});
