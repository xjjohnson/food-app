import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { countChange, daysUntil, findLots, loadCountLines, loadExpiring, searchProducts, throwOutChange, traceLot } from '../lib/stock';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const TODAY = new Date(2026, 10, 25);

/** Jelly in two batches (one near its date), and a cookie batch made from a flour batch, one jar sent to a customer. */
function shelves(odoo: FakeOdoo) {
  const jelly = odoo.create('product.product', { name: 'Grape jelly' });
  const flour = odoo.create('product.product', { name: 'Flour' });
  const near = odoo.create('stock.lot', { name: 'J-NEAR', product_id: [jelly, 'Grape jelly'], expiration_date: '2026-11-30 12:00:00', product_qty: 4 });
  const far = odoo.create('stock.lot', { name: 'J-FAR', product_id: [jelly, 'Grape jelly'], expiration_date: '2027-06-01 12:00:00', product_qty: 9 });
  const gone = odoo.create('stock.lot', { name: 'J-GONE', product_id: [jelly, 'Grape jelly'], expiration_date: '2026-11-01 12:00:00', product_qty: 0 });
  const fl = odoo.create('stock.lot', { name: 'F-77', product_id: [flour, 'Flour'], product_qty: 20 });
  const qNear = odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], lot_id: [near, 'J-NEAR'], location_id: [8, 'WH/Stock'], quantity: 4 });
  odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], lot_id: [far, 'J-FAR'], location_id: [8, 'WH/Stock'], quantity: 9 });
  // A finished batch made from the flour batch.
  const mo = odoo.create('mrp.production', { name: 'WH/MO/00001', state: 'done', lot_producing_ids: [far], move_raw_ids: [] });
  const raw = odoo.create('stock.move', { raw_material_production_id: mo, product_id: [flour, 'Flour'], move_line_ids: [] });
  const rawLine = odoo.create('stock.move.line', { move_id: [raw, 'm'], product_id: [flour, 'Flour'], lot_id: [fl, 'F-77'], quantity: 3 });
  odoo.tables['stock.move']!.find((m) => m.id === raw)!.move_line_ids = [rawLine];
  odoo.tables['mrp.production']!.find((m) => m.id === mo)!.move_raw_ids = [raw];
  // One jar of the far batch went out on a done delivery.
  const pick = odoo.create('stock.picking', { name: 'WH/OUT/00005', origin: 'S00005', partner_id: [7, 'Pat Customer'], picking_type_code: 'outgoing', state: 'done' });
  odoo.create('stock.move.line', { move_id: [0, 'x'], picking_id: pick, lot_id: [far, 'J-FAR'], quantity: 1 });
  return { jelly, flour, near, far, gone, fl, qNear };
}

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('stock lib', () => {
  test('a count is applied once, and Odoo ends up with the counted number', async () => {
    const { odoo } = bakery();
    const s = shelves(odoo);
    const c = await client(odoo);
    expect((await searchProducts(c, 'jel')).map((p) => p.name)).toEqual(['Grape jelly']);
    const lines = await loadCountLines(c, s.jelly);
    const near = lines.find((l) => l.lot === 'J-NEAR')!;
    expect(near).toMatchObject({ onHand: 4, place: 'WH/Stock' });
    await saveOrQueue(c, AsyncStorage, DB, 1, countChange('Grape jelly', near, 3));
    expect(odoo.tables['stock.quant']!.find((q) => q.id === s.qNear)!.quantity).toBe(3);
  });

  test('a count made without signal waits, then applies when signal returns', async () => {
    const { odoo } = bakery();
    const s = shelves(odoo);
    const c = await client(odoo);
    const near = (await loadCountLines(c, s.jelly)).find((l) => l.lot === 'J-NEAR')!;
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, countChange('Grape jelly', near, 2))).status).toBe('queued');
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(1);
    expect(odoo.tables['stock.quant']!.find((q) => q.id === s.qNear)!.quantity).toBe(2);
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
  });

  test('expiring soon lists batches with stock by date, and throwing one out takes it off the stock', async () => {
    const { odoo } = bakery();
    const s = shelves(odoo);
    const c = await client(odoo);
    const list = await loadExpiring(c, 14, TODAY);
    expect(list.map((l) => [l.lot, l.days])).toEqual([['J-NEAR', 5]]);
    expect((await loadExpiring(c, 400, TODAY)).map((l) => l.lot)).toEqual(['J-NEAR', 'J-FAR']);
    await saveOrQueue(c, AsyncStorage, DB, 1, throwOutChange(list[0]!));
    expect(odoo.tables['stock.scrap']![0]).toMatchObject({ state: 'done', scrap_qty: 4 });
    expect(odoo.tables['stock.quant']!.find((q) => q.id === s.qNear)!.quantity).toBe(0);
    expect(daysUntil('2026-11-20', TODAY)).toBe(-5);
  });

  test('finding a batch shows what it was made from and where it went', async () => {
    const { odoo } = bakery();
    const s = shelves(odoo);
    const c = await client(odoo);
    const [hit] = await findLots(c, 'far');
    expect(hit).toMatchObject({ name: 'J-FAR' });
    const t = (await traceLot(c, s.far))!;
    expect(t.madeIn).toEqual([{ name: 'WH/MO/00001', ingredients: [{ product: 'Flour', lot: 'F-77' }] }]);
    expect(t.wentOutOn).toEqual([{ name: 'WH/OUT/00005', origin: 'S00005', customer: 'Pat Customer', qty: 1 }]);
    // The other direction: the flour batch shows what it went into.
    const f = (await traceLot(c, s.fl))!;
    expect(f.usedIn).toEqual([{ name: 'WH/MO/00001', product: expect.any(String) }]);
  });
});

describe('stock screen', () => {
  test('counting a product from the screen saves the new number in Odoo', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const s = shelves(odoo);
    odoo.addEmployee('Ivy Inventory', odoo.addUser({ login: 'inv@example.com' }).id, ['Inventory']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'inv@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/stock' });
    await settle();
    await fireEvent.press(screen.getByTestId('stock-count'));
    await settle();
    await fireEvent.changeText(screen.getByTestId('count-search'), 'jelly');
    await fireEvent.press(await screen.findByTestId(`count-product-${s.jelly}`));
    await settle();
    await fireEvent.changeText(screen.getByTestId(`counted-${s.qNear}`), '3');
    await fireEvent.press(screen.getByTestId('save-counts'));
    await settle();
    expect(odoo.tables['stock.quant']!.find((q) => q.id === s.qNear)!.quantity).toBe(3);
  });
});
