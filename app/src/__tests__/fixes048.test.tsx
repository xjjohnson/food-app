import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { findLots } from '../lib/stock';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadToMake, makeLink, makeShort } from '../lib/orders';
import { loadBillPayments, loadPoState, orderBillChange } from '../lib/poBill';
import { enqueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
};

async function open(odoo: FakeOdoo, url: string, role: string) {
  await AsyncStorage.clear();
  odoo.addEmployee('Tester', odoo.addUser({ login: 'role@example.com' }).id, [role]);
  odoo.declared['purchase.order'] = ['partner_id', 'partner_ref', 'date_order', 'date_planned', 'notes', 'origin'];
  globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
  const login = { url: URL, db: 'food-test', login: 'role@example.com' };
  await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
  await deviceSecrets().set('odoo.secret', 'key');
  await setDbKind(AsyncStorage, login, 'test');
  await renderRouter('src/app', { initialUrl: url });
  await settle();
}

/** A confirmed order whose delivery is done, as P00009 was. */
function received(odoo: FakeOdoo) {
  const cash = odoo.create('account.journal', { name: 'Cash', type: 'cash' });
  const apricot = odoo.create('product.product', { name: 'Apricot Halves' });
  const po = odoo.create('purchase.order', { name: 'P00009', partner_id: [5, 'heb'], state: 'purchase', date_order: '2026-11-26 22:09:00' });
  odoo.create('purchase.order.line', { order_id: po, product_id: [apricot, 'Apricot Halves'], product_qty: 3, product_uom_id: [2, 'oz'], price_unit: 0.11 });
  const pick = odoo.create('stock.picking', { name: 'WH/IN/00008', origin: 'P00009', state: 'done', picking_type_code: 'incoming' });
  odoo.tables['purchase.order']![0]!.picking_ids = [pick];
  return { po, cash };
}

describe('bill an order that already exists', () => {
  test('one step makes the bill, posts it and pays it; the bill then says when and how', async () => {
    const { odoo } = bakery();
    const { po, cash } = received(odoo);
    const c = await client(odoo);
    expect(await loadPoState(c, po)).toMatchObject({ name: 'P00009', state: 'purchase', openReceipts: 0, doneReceipts: 1, bills: [] });
    await enqueue(AsyncStorage, DB, 1, orderBillChange(po, 'P00009', cash, 'Cash', '2026-11-26'));
    await enqueue(AsyncStorage, DB, 1, orderBillChange(po, 'P00009', cash, 'Cash', '2026-11-26'));
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['account.move']).toHaveLength(1);
    expect(odoo.tables['account.payment']).toHaveLength(1);
    const state = await loadPoState(c, po);
    expect(state.bills).toHaveLength(1);
    expect(state.bills[0]!.paid).toBe(true);
    expect(await loadBillPayments(c, state.bills[0]!.id)).toEqual([{ date: '2026-11-26', how: 'Cash', amount: 0.33 }]);
  });

  test('the order screen offers the bill after the delivery, and Cash pays it', async () => {
    const { odoo } = bakery();
    const { po } = received(odoo);
    await open(odoo, '/area/ingredients?go=pos', 'Inventory');
    await fireEvent.press(await screen.findByTestId(`po-${po}`));
    await settle();
    await fireEvent.press(await screen.findByTestId('form-tabs-lines'));
    await settle();
    expect(screen.queryByTestId('po-confirm')).toBeNull();
    await fireEvent.press(await screen.findByTestId('po-pay-cash'));
    await settle();
    expect(await screen.findByText(/Bill made and paid with Cash/)).toBeTruthy();
    expect(odoo.tables['account.move']![0]).toMatchObject({ state: 'posted', payment_state: 'paid' });
  });

  test('a confirmed order still waiting for its delivery shows Check in, not the bill', async () => {
    const { odoo } = bakery();
    const { po } = received(odoo);
    odoo.tables['stock.picking']![0]!.state = 'assigned';
    await open(odoo, '/area/ingredients?go=pos', 'Inventory');
    await fireEvent.press(await screen.findByTestId(`po-${po}`));
    await settle();
    await fireEvent.press(await screen.findByTestId('form-tabs-lines'));
    await settle();
    expect(await screen.findByTestId('po-checkin')).toBeTruthy();
    expect(screen.queryByTestId('po-bill-card')).toBeNull();
  });
});

describe('Find a batch fills itself in', () => {
  test('with nothing typed it lists the newest batches; typing narrows them', async () => {
    const { odoo } = bakery();
    const p = odoo.create('product.product', { name: 'Peach Jam' });
    for (const n of ['J-1', 'J-2', 'K-9']) odoo.create('stock.lot', { name: n, product_id: [p, 'Peach Jam'] });
    const c = await client(odoo);
    expect((await findLots(c, '')).map((l) => l.name)).toEqual(['K-9', 'J-2', 'J-1']);
    expect((await findLots(c, 'j-')).map((l) => l.name).sort()).toEqual(['J-1', 'J-2']);
  });
});

describe('plan work from waiting orders', () => {
  test('short amounts add up across waiting orders and link to Start a batch', async () => {
    const { odoo } = bakery();
    const jam = odoo.create('product.product', { name: 'Strawberry Jam', free_qty: 1 });
    const cookie = odoo.create('product.product', { name: 'Cookie', free_qty: 20 });
    for (const [name, qty, cq] of [['WH/OUT/1', 3, 2], ['WH/OUT/2', 2, 0]] as const) {
      const pick = odoo.create('stock.picking', { name, state: 'confirmed', picking_type_code: 'outgoing' });
      odoo.create('stock.move', { picking_id: pick, product_id: [jam, 'Strawberry Jam'], product_uom_qty: qty, location_id: [8, 'Stock'], location_dest_id: [5, 'Customers'], move_line_ids: [] });
      if (cq) odoo.create('stock.move', { picking_id: pick, product_id: [cookie, 'Cookie'], product_uom_qty: cq, location_id: [8, 'Stock'], location_dest_id: [5, 'Customers'], move_line_ids: [] });
    }
    const c = await client(odoo);
    const waiting = odoo.tables['stock.picking']!.map((p) => ({ id: p.id as number })) as never;
    expect(await loadToMake(c, waiting)).toEqual([{ productId: jam, name: 'Strawberry Jam', need: 5, free: 1, short: 4 }]);
    expect(makeShort(3, 1)).toBe(2);
    expect(makeShort(3, 5)).toBe(0);
    expect(makeLink(7, 4)).toBe('/area/production?go=make:7:4');
  });

  test('the Website orders screen shows What to make, and the link opens Start batch with the amount', async () => {
    const { odoo } = bakery();
    const jam = odoo.create('product.product', { name: 'Strawberry Jam', free_qty: 0 });
    const sale = odoo.create('sale.order', { name: 'S00001' });
    const pick = odoo.create('stock.picking', { name: 'WH/OUT/1', origin: 'S00001', partner_id: [7, 'Pat'], state: 'confirmed', picking_type_code: 'outgoing', sale_id: [sale, 'S00001'], scheduled_date: '2026-11-27 10:00:00' });
    odoo.create('stock.move', { picking_id: pick, product_id: [jam, 'Strawberry Jam'], product_uom_qty: 3, location_id: [8, 'Stock'], location_dest_id: [5, 'Customers'], move_line_ids: [] });
    await open(odoo, '/area/orders', 'Shipping & Packaging');
    expect(await screen.findByTestId('to-make')).toHaveTextContent(/3 Strawberry Jam/);
    await fireEvent.press(await screen.findByTestId(`order-${pick}`));
    await settle();
    expect(await screen.findByTestId(`make-${odoo.tables['stock.move']![0]!.id}`)).toBeTruthy();
  });

  test('Start batch opens on the recipe for that product with the amount filled in', async () => {
    const { odoo } = bakery();
    const made = odoo.create('product.product', { name: 'Chocolate chip cookies', free_qty: 0 });
    const bom = odoo.create('mrp.bom', { product_tmpl_id: [1, 'Chocolate chip cookies'], product_id: [made, 'Chocolate chip cookies'], product_qty: 48, product_uom_id: [1, 'Units'], type: 'normal', bom_line_ids: [] });
    odoo.tables['mrp.bom']!.find((b) => b.id === bom)!.bom_line_ids = [odoo.create('mrp.bom.line', { bom_id: bom, product_id: [made, 'x'], product_qty: 1 })];
    await open(odoo, `/area/production?go=make:${made}:7`, 'Production');
    expect((await screen.findByTestId('batch-qty')).props.value).toBe('7');
  });
});
