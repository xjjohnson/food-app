import { OdooClient } from '../lib/odoo';
import { drawerTotal, drawerWords, loadDaySheet, loadPriceSheet, loadResults, loadSessions, sellThrough, takeFromLine, takeToLine, totalsFromLine, totalsMatch, totalsToLine } from '../lib/marketDay';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function market(odoo: FakeOdoo) {
  const jelly = odoo.create('product.product', { name: 'Grape jelly', display_name: 'Grape jelly', sale_ok: true, list_price: 6, qty_available: 8 });
  const cookie = odoo.create('product.product', { name: 'Cookie', display_name: 'Cookie', sale_ok: true, list_price: 2, qty_available: 30 });
  const day = (n: number, date: string, cashStart: number, cashEnd: number) => odoo.create('pos.session', { name: `S${n}`, config_id: [1, 'Farmers market'], start_at: `${date} 08:00:00`, stop_at: `${date} 14:00:00`, state: 'closed', cash_register_balance_start: cashStart, cash_register_balance_end_real: cashEnd });
  const s1 = day(1, '2026-11-14', 50, 80);
  const s2 = day(2, '2026-11-21', 50, 95);
  const order = (session: number, total: number, lines: [number, string, number][], pays: [string, number][]) => {
    const o = odoo.create('pos.order', { session_id: [session, 'S'], amount_total: total });
    for (const [p, n, q] of lines) odoo.create('pos.order.line', { order_id: [o, 'x'], product_id: [p, n], qty: q });
    for (const [m, a] of pays) odoo.create('pos.payment', { session_id: [session, 'S'], payment_method_id: [1, m], amount: a });
  };
  order(s1, 12, [[jelly, 'Grape jelly', 2]], [['Cash', 12]]);
  order(s2, 20, [[jelly, 'Grape jelly', 2], [cookie, 'Cookie', 4]], [['Cash', 10], ['Venmo', 10]]);
  order(s2, 6, [[jelly, 'Grape jelly', 1]], [['Cash App', 6]]);
  return { jelly, cookie, s1, s2 };
}

describe('market results and day sheet', () => {
  test('results add up Odoo’s totals, payments and best sellers, with stock left', async () => {
    const { odoo } = bakery();
    const { s2 } = market(odoo);
    const c = await client(odoo);
    const session = (await loadSessions(c)).find((s) => s.id === s2)!;
    const r = await loadResults(c, session);
    expect(r.orders).toBe(2);
    expect(r.total).toBe(26);
    expect(r.byWay).toEqual([{ way: 'Cash', amount: 10 }, { way: 'Cash App', amount: 6 }, { way: 'Venmo', amount: 10 }]);
    expect(r.best.map((b) => [b.name, b.qty])).toEqual([['Cookie', 4], ['Grape jelly', 3]]);
    expect(r.leftovers).toEqual([{ name: 'Cookie', onHand: 30 }, { name: 'Grape jelly', onHand: 8 }]);
  });

  test('the day sheet shows what sold at each recent market, newest first, beside stock', async () => {
    const { odoo } = bakery();
    market(odoo);
    const sheet = await loadDaySheet(await client(odoo));
    expect(sheet.dates).toEqual(['2026-11-21', '2026-11-14']);
    expect(sheet.rows.map((r) => [r.name, r.last, r.onHand])).toEqual([['Cookie', [4, 0], 30], ['Grape jelly', [3, 2], 8]]);
  });

  test('the price sheet lists what the register sells with Odoo’s list price', async () => {
    const { odoo } = bakery();
    market(odoo);
    expect((await loadPriceSheet(await client(odoo))).map((r) => [r.name, r.price]).sort()).toEqual([['Cookie', 2], ['Grape jelly', 6]]);
  });
});

describe('typed market records', () => {
  test('check-out and check-in survive one-line storage; sold is shown beside what was left', () => {
    const rows = [{ productId: 5, name: 'Grape jelly', out: '12', back: '3' }, { productId: 7, name: 'Odd; name|x', out: '6', back: '' }];
    expect(takeFromLine(takeToLine(rows))).toEqual([rows[0], { productId: 7, name: 'Odd  name x', out: '6', back: '' }]);
    expect(sellThrough(rows[0]!, 9)).toEqual({ left: 9, sold: 9, gap: 0 });
    expect(sellThrough(rows[0]!, 7).gap).toBe(2);
  });

  test('the drawer counts bills and coins to the cent and says how it compares', () => {
    expect(drawerTotal({ b20: '2', b5: '3', c25: '4', c10: '3', c1: '7' })).toBe(56.37);
    expect(drawerTotal({})).toBe(0);
    expect(drawerWords(80, 80)).toBe('Matches Odoo.');
    expect(drawerWords(82.5, 80)).toBe('2.50 more than Odoo says.');
    expect(drawerWords(78, 80)).toBe('2.00 less than Odoo says.');
  });

  test('app totals match Odoo’s to the cent', () => {
    expect(totalsFromLine(totalsToLine({ 'Cash App': '6', Venmo: ' 10.5 ', Empty: '' }))).toEqual({ 'Cash App': '6', Venmo: '10.5' });
    expect(totalsMatch('6.00', 6)).toBe(true);
    expect(totalsMatch('5.99', 6)).toBe(false);
    expect(totalsMatch('', 0)).toBe(false);
  });
});
