import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { handOverChanges, loadLotStock, loadOrders, loadPackLines, oldestFirst } from '../lib/orders';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

/** 10 jars of jelly in two batches (the newer one has the later use-by date) and one website order for 6. */
function shop(odoo: FakeOdoo) {
  const jelly = odoo.create('product.product', { name: 'Grape jelly' });
  const newer = odoo.create('stock.lot', { name: 'J-NEW', expiration_date: '2027-03-01 12:00:00' });
  const older = odoo.create('stock.lot', { name: 'J-OLD', expiration_date: '2026-12-01 12:00:00' });
  odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], lot_id: [newer, 'J-NEW'], quantity: 8, 'location_id.usage': 'internal' });
  odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], lot_id: [older, 'J-OLD'], quantity: 4, 'location_id.usage': 'internal' });
  const pick = odoo.create('stock.picking', { name: 'WH/OUT/00001', origin: 'S00001', partner_id: [7, 'Pat Customer'], state: 'assigned', picking_type_code: 'outgoing', scheduled_date: '2026-11-26 10:00:00' });
  // Odoo set aside the newer batch by default.
  const line = odoo.create('stock.move.line', { move_id: [0, 'x'], lot_id: [newer, 'J-NEW'], quantity: 6 });
  const move = odoo.create('stock.move', { picking_id: pick, product_id: [jelly, 'Grape jelly'], product_uom_qty: 6, location_id: [8, 'Stock'], location_dest_id: [5, 'Customers'], move_line_ids: [line] });
  odoo.tables['stock.move.line']!.find((l) => l.id === line)!.move_id = [move, 'Move'];
  return { jelly, newer, older, pick, move };
}

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('website orders lib', () => {
  test('oldest use-by date goes first, then the next batch covers the rest', () => {
    const r = oldestFirst(
      [
        { lotId: 1, lot: 'NEW', useBy: '2027-03-01', qty: 8 },
        { lotId: 2, lot: 'OLD', useBy: '2026-12-01', qty: 4 },
        { lotId: 3, lot: 'NONE', useBy: '', qty: 50 },
      ],
      6,
      '2026-11-26',
    );
    expect(r.picks.map((p) => [p.lot, p.qty])).toEqual([['OLD', 4], ['NEW', 2]]);
    expect(r.short).toBe(0);
    expect(oldestFirst([{ lotId: 1, lot: 'A', useBy: '', qty: 2 }], 5).short).toBe(3);
  });

  test('a batch past its use-by date is used last and marked expired', () => {
    const stock = [
      { lotId: 1, lot: 'EXPIRED', useBy: '2026-03-18', qty: 6 },
      { lotId: 2, lot: 'GOOD', useBy: '2027-03-18', qty: 4 },
    ];
    const enough = oldestFirst(stock, 3, '2026-11-26');
    expect(enough.picks.map((p) => [p.lot, p.expired])).toEqual([['GOOD', undefined]]);
    const more = oldestFirst(stock, 8, '2026-11-26');
    expect(more.picks.map((p) => [p.lot, p.qty, p.expired])).toEqual([['GOOD', 4, undefined], ['EXPIRED', 4, true]]);
  });

  test('packs the oldest batch first and hands the order over', async () => {
    const { odoo } = bakery();
    const s = shop(odoo);
    const c = await client(odoo);
    const [order] = await loadOrders(c);
    expect(order).toMatchObject({ name: 'WH/OUT/00001', customer: 'Pat Customer' });
    const lines = await loadPackLines(c, order!.id);
    const stock = await loadLotStock(c, s.jelly);
    const plan = lines.map((line) => ({ line, picks: oldestFirst(stock, line.qty).picks }));
    const changes = handOverChanges(order!, plan);
    expect(changes.map((x) => x.method)).toEqual(['write', 'message_post', 'button_validate']);
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    const pick = odoo.tables['stock.picking']![0]!;
    expect(pick.state).toBe('done');
    const used = odoo.tables['stock.move.line']!.filter((l) => (odoo.tables['stock.move']![0]!.move_line_ids as number[]).includes(l.id));
    expect(used.map((l) => [(l.lot_id as number[])[0], l.quantity])).toEqual([[s.older, 4], [s.newer, 2]]);
    expect(odoo.tables['mail.message']![0]!.body).toMatch(/Packed/);
  });

  test('when Odoo already set aside the right batch, nothing is rewritten', async () => {
    const { odoo } = bakery();
    const s = shop(odoo);
    odoo.tables['stock.quant']!.pop();
    const c = await client(odoo);
    const [order] = await loadOrders(c);
    const lines = await loadPackLines(c, order!.id);
    const plan = lines.map((line) => ({ line, picks: oldestFirst([{ lotId: s.newer, lot: 'J-NEW', useBy: '', qty: 8 }], line.qty).picks }));
    expect(handOverChanges(order!, plan).map((x) => x.method)).toEqual(['message_post', 'button_validate']);
  });

  test('without signal the hand-over waits, and is sent once, in order', async () => {
    const { odoo } = bakery();
    shop(odoo);
    const c = await client(odoo);
    const [order] = await loadOrders(c);
    const lines = await loadPackLines(c, order!.id);
    const changes = handOverChanges(order!, lines.map((line) => ({ line, picks: [] })));
    odoo.offline = true;
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(await loadQueue(AsyncStorage)).toHaveLength(2);
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['stock.picking']![0]!.state).toBe('done');
    expect(odoo.tables['mail.message']).toHaveLength(1);
  });
});

describe('website orders screen', () => {
  test('a shipper opens an order, sees the oldest batch to take, and hands it over', async () => {
    await AsyncStorage.clear();
    const fake = bakery();
    const odoo = fake.odoo;
    shop(odoo);
    odoo.addEmployee('Shay Shipper', odoo.addUser({ login: 'ship@example.com', groups: ['stock.group_stock_user'] }).id, ['Shipping & Packaging']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'ship@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/orders' });
    await settle();
    const pick = odoo.tables['stock.picking']![0]!;
    await fireEvent.press(screen.getByTestId(`order-${pick.id}`));
    await settle();
    const move = odoo.tables['stock.move']![0]!;
    expect(screen.getByTestId(`line-${move.id}`)).toHaveTextContent(/4 from batch J-OLD \(use by 2026-12-01\), 2 from batch J-NEW/);
    expect(screen.queryByTestId('how-pickup')).toBeNull();
    await fireEvent.press(screen.getByTestId('hand-over'));
    await settle();
    expect(pick.state).toBe('done');
    expect(odoo.tables['mail.message']![0]!.body).toMatch(/Packed/);
  });
});
