import { OdooClient } from '../lib/odoo';
import { bestFirst, breakEvenUnits, loadSold, loadStockValue, loadYears, rangeDays, slowest } from '../lib/reports';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function shop(odoo: FakeOdoo) {
  const jelly = odoo.create('product.product', { name: 'Grape jelly', display_name: 'Grape jelly', sale_ok: true, standard_price: 2, list_price: 6 });
  const cookie = odoo.create('product.product', { name: 'Cookie', display_name: 'Cookie', sale_ok: true, standard_price: 0.5, list_price: 2 });
  const unsold = odoo.create('product.product', { name: 'Fudge', display_name: 'Fudge', sale_ok: true, standard_price: 3, list_price: 8 });
  return { jelly, cookie, unsold };
}

describe('report dates', () => {
  test('ranges are plain calendar days', () => {
    const now = new Date(2026, 10, 26);
    expect(rangeDays('today', now)).toEqual({ from: '2026-11-26', to: '2026-11-26' });
    expect(rangeDays('week', now)).toEqual({ from: '2026-11-20', to: '2026-11-26' });
    expect(rangeDays('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-26' });
    expect(rangeDays('lastmonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeDays('year', now)).toEqual({ from: '2026-01-01', to: '2026-11-26' });
  });
});

describe('sales and profit', () => {
  test('orders and market sales add up by product with Odoo’s own cost beside them', async () => {
    const { odoo } = bakery();
    const { jelly, cookie } = shop(odoo);
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 4, price_subtotal: 24, date: '2026-11-10 10:00:00', state: 'sale' });
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 1, price_subtotal: 6, date: '2026-11-11 10:00:00', state: 'done' });
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 9, price_subtotal: 54, date: '2026-11-12 10:00:00', state: 'draft' });
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 2, price_subtotal: 12, date: '2026-10-01 10:00:00', state: 'sale' });
    odoo.create('pos.order.line', { product_id: [cookie, 'Cookie'], qty: 12, price_subtotal: 24, create_date: '2026-11-15 09:00:00' });
    const sold = await loadSold(await client(odoo), '2026-11-01', '2026-11-26');
    const j = sold.find((r) => r.productId === jelly)!;
    expect(j).toMatchObject({ units: 5, sales: 30, cost: 2, margin: null });
    expect(sold.find((r) => r.productId === cookie)).toMatchObject({ units: 12, sales: 24, cost: 0.5 });
    expect(bestFirst(sold).map((r) => r.name)).toEqual(['Cookie', 'Grape jelly']);
  });

  test('slowest sellers include products that sold nothing', async () => {
    const { odoo } = bakery();
    const { jelly } = shop(odoo);
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 4, price_subtotal: 24, date: '2026-11-10 10:00:00', state: 'sale' });
    const c = await client(odoo);
    const sold = await loadSold(c, '2026-11-01', '2026-11-26');
    expect((await slowest(c, sold, 2)).map((r) => r.name)).toEqual(['Cookie', 'Fudge']);
  });
});

describe('stock value and years', () => {
  test('stock value uses Odoo’s value on each line, or says it has none', async () => {
    const { odoo } = bakery();
    const { jelly, cookie } = shop(odoo);
    odoo.declared['stock.quant'] = ['value'];
    odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], quantity: 10, value: 20 });
    odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], quantity: 5, value: 10 });
    odoo.create('stock.quant', { product_id: [cookie, 'Cookie'], quantity: 20, value: 10 });
    const v = await loadStockValue(await client(odoo));
    expect(v.known).toBe(true);
    expect(v.total).toBe(40);
    expect(v.rows.map((r) => [r.name, r.qty, r.value])).toEqual([['Grape jelly', 15, 30], ['Cookie', 20, 10]]);
  });

  test('this year against last year by month', async () => {
    const { odoo } = bakery();
    const { jelly } = shop(odoo);
    const sale = (date: string, v: number) => odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], price_subtotal: v, date: `${date} 10:00:00`, state: 'sale' });
    sale('2026-03-05', 10);
    sale('2026-03-20', 5);
    sale('2025-03-05', 7);
    sale('2025-12-31', 1);
    const y = await loadYears(await client(odoo), new Date(2026, 10, 26));
    expect(y.thisYear[2]).toBe(15);
    expect(y.lastYear[2]).toBe(7);
    expect(y.lastYear[11]).toBe(1);
  });
});

describe('break-even', () => {
  test('a count of units, or nothing when the price does not beat the cost', () => {
    expect(breakEvenUnits(50, 6, 2)).toBe(13);
    expect(breakEvenUnits(50, 2, 2)).toBeNull();
    expect(breakEvenUnits(0, 6, 2)).toBeNull();
  });
});
