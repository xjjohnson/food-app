import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyRoute, draftOrderChanges, findByCode, labelText, loadReadings, loadScorecard, loadVehicles, moveStop, readingChange, readingProblems, routeLink, sortByZip } from '../lib/buying';
import { OdooClient } from '../lib/odoo';
import { enqueue, sendQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('draft orders', () => {
  test('one draft per supplier, once a day, and nothing without a supplier', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    const rows = [
      { productId: 1, name: 'Sugar', qty: 10, supplierId: 5, supplier: 'Acme' },
      { productId: 2, name: 'Pectin', qty: 2, supplierId: 5, supplier: 'Acme' },
      { productId: 3, name: 'Jars', qty: 100, supplierId: 6, supplier: 'Glass Co' },
      { productId: 4, name: 'Lemons', qty: 3, supplierId: 0, supplier: '' },
    ];
    const changes = draftOrderChanges(rows, '2026-12-01');
    expect(changes).toHaveLength(2);
    for (const ch of [...changes, ...changes]) await enqueue(AsyncStorage, DB, 1, ch);
    await sendQueue(c, AsyncStorage, DB);
    const pos = odoo.tables['purchase.order']!;
    expect(pos).toHaveLength(2);
    expect(pos.every((p) => p.state === 'draft')).toBe(true);
  });
});

describe('route', () => {
  const stops = [
    { id: 1, address: '1 A St', zip: '90' },
    { id: 2, address: '2 B St', zip: '10' },
    { id: 3, address: '3 C St', zip: '' },
  ];
  test('sort by zip, saved order, move, maps link', () => {
    expect(sortByZip(stops).map((s) => s.id)).toEqual([2, 1, 3]);
    expect(applyRoute(stops, '3,1').map((s) => s.id)).toEqual([3, 1, 2]);
    expect(moveStop([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveStop([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    const url = routeLink(stops);
    expect(url).toContain('destination=3%20C%20St');
    expect(url).toContain('waypoints=1%20A%20St%7C2%20B%20St');
    expect(routeLink([])).toBe('');
  });
});

describe('mileage', () => {
  test('no Fleet app gives null; readings save once and list', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    expect(await loadVehicles({ call: async () => { throw new Error('Object fleet.vehicle doesn’t exist'); } })).toBeNull();
    const v = odoo.create('fleet.vehicle', { name: 'Van', odometer: 100 });
    odoo.tables['fleet.vehicle.odometer'] = [];
    expect((await loadVehicles(c))![0]!.name).toBe('Van');
    const ch = readingChange({ id: v, name: 'Van' }, 150, '2026-12-01');
    await enqueue(AsyncStorage, DB, 1, ch);
    await sendQueue(c, AsyncStorage, DB);
    await enqueue(AsyncStorage, DB, 1, ch);
    await sendQueue(c, AsyncStorage, DB);
    expect(await loadReadings(c, v)).toHaveLength(1);
    expect(readingProblems('90', '2026-12-02', 150)[0]).toMatch(/can’t be lower/);
    expect(readingProblems('', 'x')).toHaveLength(2);
  });
});

describe('scan and label', () => {
  test('matches a barcode, then a batch number, else nothing', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    odoo.create('product.product', { name: 'Grape jelly', barcode: '12345', product_tmpl_id: [1, 'Grape jelly'] });
    odoo.create('stock.lot', { name: 'GJ-0042', product_id: [1, 'Grape jelly'] });
    expect(await findByCode(c, '12345')).toMatchObject({ kind: 'product', name: 'Grape jelly' });
    expect(await findByCode(c, 'GJ-0042')).toMatchObject({ kind: 'lot', name: 'GJ-0042' });
    expect(await findByCode(c, 'nope')).toBeNull();
    expect(await findByCode(c, ' ')).toBeNull();
  });

  test('label text lists batch, use-by and ingredients', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    const text = await labelText(c, { lot: { id: 1, name: 'GJ-1', product: 'Grape jelly', useBy: '2027-01-01', onHand: 3 }, madeIn: [{ name: 'MO1', ingredients: [{ product: 'Grapes', lot: 'G1' }, { product: 'Sugar', lot: 'S1' }] }], usedIn: [], wentOutOn: [] });
    expect(text).toContain('Grape jelly');
    expect(text).toContain('Batch GJ-1');
    expect(text).toContain('Use by 2027-01-01');
    expect(text).toContain('Ingredients: Grapes, Sugar');
  });
});

describe('scorecard', () => {
  test('counts on time and late, and a price change', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    const p1 = odoo.create('stock.picking', { state: 'done', date_done: '2026-11-02 10:00:00' });
    const p2 = odoo.create('stock.picking', { state: 'done', date_done: '2026-11-20 10:00:00' });
    const o1 = odoo.create('purchase.order', { name: 'P1', partner_id: 9, state: 'purchase', date_planned: '2026-11-03 00:00:00', date_approve: '2026-10-30 00:00:00', picking_ids: [p1] });
    const o2 = odoo.create('purchase.order', { name: 'P2', partner_id: 9, state: 'purchase', date_planned: '2026-11-10 00:00:00', date_approve: '2026-11-05 00:00:00', picking_ids: [p2] });
    odoo.create('purchase.order.line', { order_id: o1, product_id: [1, 'Sugar'], price_unit: 1 });
    odoo.create('purchase.order.line', { order_id: o2, product_id: [1, 'Sugar'], price_unit: 1.5 });
    const s = await loadScorecard(c, 9);
    expect(s).toMatchObject({ orders: 2, onTime: 1, late: 1 });
    expect(s.priceChanges).toEqual([{ product: 'Sugar', from: 1, to: 1.5 }]);
    expect(s.lastDeliveries[0]!.order).toBe('P2');
  });
});
