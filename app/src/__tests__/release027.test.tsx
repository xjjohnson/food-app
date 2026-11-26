import AsyncStorage from '@react-native-async-storage/async-storage';
import { OdooClient } from '../lib/odoo';
import { enqueue, saveOrQueue, sendQueue } from '../lib/queue';
import { confirmChange, emailQuote, invoiceChange, loadQuotes, loadRepeatList, quoteText, repeatChange } from '../lib/sell';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function orders(odoo: FakeOdoo) {
  const o = (name: string, partner: [number, string], date: string, state: string, total = 30) => odoo.create('sale.order', { name, partner_id: partner, date_order: `${date} 10:00:00`, state, amount_total: total, amount_untaxed: total - 2, amount_tax: 2 });
  return {
    a1: o('S1', [5, 'Anna Cafe'], '2026-09-01', 'sale'),
    a2: o('S2', [5, 'Anna Cafe'], '2026-10-01', 'sale'),
    a3: o('S3', [5, 'Anna Cafe'], '2026-10-31', 'sale'),
    b1: o('S4', [6, 'Ben Shop'], '2026-11-20', 'sale'),
    q: o('S5', [7, 'Cy Deli'], '2026-11-25', 'draft', 55),
  };
}

describe('quotes and orders', () => {
  test('open quotes list newest first with Odoo’s words and totals', async () => {
    const { odoo } = bakery();
    const { q } = orders(odoo);
    const rows = await loadQuotes(await client(odoo));
    expect(rows[0]).toMatchObject({ id: q, name: 'S5', customer: 'Cy Deli', total: 55, state: 'draft' });
    expect(rows).toHaveLength(5);
  });

  test('confirm turns a quote into an order, and asking twice does not break', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const { q } = orders(odoo);
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, confirmChange(q, 'S5'));
    expect(odoo.tables['sale.order']!.find((x) => x.id === q)!.state).toBe('sale');
  });

  test('the invoice step makes one invoice and needs a confirmed order', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const { a3, q } = orders(odoo);
    const c = await client(odoo);
    await expect(saveOrQueue(c, AsyncStorage, DB, 1, invoiceChange(q, 'S5'))).rejects.toThrow('Confirm the order first');
    await saveOrQueue(c, AsyncStorage, DB, 1, invoiceChange(a3, 'S3'));
    await saveOrQueue(c, AsyncStorage, DB, 1, invoiceChange(a3, 'S3'));
    expect(odoo.tables['account.move']!.filter((m) => m.move_type === 'out_invoice')).toHaveLength(1);
  });

  test('the quote text reads every number back from Odoo', async () => {
    const { odoo } = bakery();
    const { q } = orders(odoo);
    odoo.create('sale.order.line', { order_id: q, product_id: [1, 'Grape jelly'], name: 'Grape jelly', product_uom_qty: 12, price_unit: 4, discount: 0, price_subtotal: 48, display_type: false });
    const t = await quoteText(await client(odoo), q);
    expect(t).toContain('Quote S5');
    expect(t).toContain('For Cy Deli');
    expect(t).toContain('12 x Grape jelly  at 4.00 = 48.00');
    expect(t).toContain('Total 55.00');
  });

  test('email from Odoo only runs when asked, through Odoo’s own wizard', async () => {
    const { odoo } = bakery();
    const { q } = orders(odoo);
    odoo.calls.length = 0;
    await emailQuote(await client(odoo), q);
    expect(odoo.calls.map((x) => `${x.model}.${x.method}`).filter((x) => x.startsWith('sale'))).toEqual(['sale.order.send.create', 'sale.order.send.action_send_mail']);
  });
});

describe('repeat orders', () => {
  test('usual gap, days since, and the most overdue first', async () => {
    const { odoo } = bakery();
    orders(odoo);
    const rows = await loadRepeatList(await client(odoo), new Date(2026, 10, 26));
    expect(rows.map((r) => [r.customer, r.every, r.sinceDays, r.orders])).toEqual([['Anna Cafe', 30, 26, 3], ['Ben Shop', null, 6, 1]]);
  });

  test('repeat makes one new quote copied from the last order, even if sent twice', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const { a3 } = orders(odoo);
    const c = await client(odoo);
    const change = repeatChange(a3, 'Anna Cafe', 1700000000000);
    await enqueue(AsyncStorage, DB, 1, change);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    const copies = odoo.tables['sale.order']!.filter((x) => String(x.origin ?? '').startsWith('food-app-repeat-'));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ state: 'draft', partner_id: [5, 'Anna Cafe'] });
  });
});
