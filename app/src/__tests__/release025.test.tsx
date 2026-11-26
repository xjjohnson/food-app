import AsyncStorage from '@react-native-async-storage/async-storage';
import { toCsv } from '../lib/csv';
import { expenseChange, expenseProblems, runExpense } from '../lib/expense';
import { budgetRows, goalPercent, loadBillsDue, loadCash, loadSpent, loadTax } from '../lib/moneyReports';
import { OdooClient } from '../lib/odoo';
import { buildPacket } from '../lib/packet';
import { keepPhoto } from '../lib/photoFiles';
import { enqueue, sendQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('csv', () => {
  test('quotes commas, quotes and line breaks', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"'], [1, null, 'x\ny']])).toBe('a,"b,c","say ""hi"""\r\n1,,"x\ny"\r\n');
  });
});

describe('tax, cash and bills due', () => {
  test('sales tax reads as collected, grouped by month and tax name', async () => {
    const { odoo } = bakery();
    const sale = odoo.create('account.tax', { name: 'Sales 6%', type_tax_use: 'sale' });
    const buy = odoo.create('account.tax', { name: 'Purchase 6%', type_tax_use: 'purchase' });
    const line = (tax: number, name: string, balance: number, base: number, date: string) => odoo.create('account.move.line', { tax_line_id: [tax, name], balance, tax_base_amount: base, date, parent_state: 'posted' });
    line(sale, 'Sales 6%', -3, 50, '2026-11-02');
    line(sale, 'Sales 6%', -1.5, 25, '2026-11-20');
    line(sale, 'Sales 6%', -2, 30, '2026-10-05');
    line(buy, 'Purchase 6%', 0.6, 10, '2026-11-09');
    const rows = await loadTax(await client(odoo), 2026);
    expect(rows.map((r) => [r.month, r.tax, r.amount, r.base])).toEqual([['2026-11', 'Purchase 6%', 0.6, 10], ['2026-11', 'Sales 6%', 4.5, 75], ['2026-10', 'Sales 6%', 2, 30]]);
  });

  test('cash in and out by way of payment, including market payments', async () => {
    const { odoo } = bakery();
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    odoo.create('account.payment', { journal_id: [1, 'Cash'], amount: 20, payment_type: 'inbound', date: day, state: 'paid' });
    odoo.create('account.payment', { journal_id: [1, 'Cash'], amount: 5, payment_type: 'outbound', date: day, state: 'paid' });
    odoo.create('account.payment', { journal_id: [2, 'Venmo'], amount: 8, payment_type: 'inbound', date: day, state: 'paid' });
    odoo.create('pos.payment', { payment_method_id: [9, 'Cash App'], amount: 12, payment_date: `${day} 10:00:00` });
    const rows = await loadCash(await client(odoo), 'today', now);
    expect(rows.map((r) => [r.way, r.cashIn, r.cashOut])).toEqual([['Cash', 20, 5], ['Market: Cash App', 12, 0], ['Venmo', 8, 0]]);
  });

  test('bills due: unpaid only, soonest first, late ones counted in days', async () => {
    const { odoo } = bakery();
    const bill = (name: string, due: string, pay: string) => odoo.create('account.move', { name, move_type: 'in_invoice', state: 'posted', payment_state: pay, invoice_date: '2026-11-01', invoice_date_due: due, partner_id: [3, 'Mill'], amount_total: 10, amount_residual: 10 });
    bill('B/1', '2026-12-10', 'not_paid');
    bill('B/2', '2026-11-20', 'not_paid');
    bill('B/3', '2026-11-01', 'paid');
    const rows = await loadBillsDue(await client(odoo), new Date(2026, 10, 26));
    expect(rows.map((r) => [r.name, r.late])).toEqual([['B/2', 6], ['B/1', -14]]);
  });
});

describe('goal and budget', () => {
  test('percent of the goal, capped for display', () => {
    expect(goalPercent(1000, 250)).toBe(25);
    expect(goalPercent(0, 250)).toBe(0);
    expect(goalPercent(10, 100000)).toBe(999);
  });

  test('budget rows show what was spent by category from posted bill lines', async () => {
    const { odoo } = bakery();
    const sugar = odoo.create('product.product', { name: 'Sugar', categ_id: [4, 'Raw'] });
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    odoo.create('account.move.line', { move_type: 'in_invoice', parent_state: 'posted', product_id: [sugar, 'Sugar'], price_subtotal: 40, date: day });
    odoo.create('account.move.line', { move_type: 'in_invoice', parent_state: 'posted', product_id: [sugar, 'Sugar'], price_subtotal: 10, date: day });
    const spent = await loadSpent(await client(odoo), now);
    expect(spent.get(4)).toEqual({ name: 'Raw', spent: 50 });
    const rows = budgetRows([{ id: 4, name: 'Raw' }, { id: 5, name: 'Packaging' }], spent, { 'budget.4': '60', 'budget.5': '' });
    expect(rows).toEqual([{ categoryId: 4, name: 'Raw', budget: 60, actual: 50 }]);
  });
});

describe('expenses', () => {
  test('problems are said in plain words', () => {
    expect(expenseProblems({ what: '', amountText: '', date: 'x', accountId: 0 })).toHaveLength(4);
    expect(expenseProblems({ what: 'Lids', amountText: '12,50', date: '2026-11-26', accountId: 7 })).toEqual([]);
  });

  test('an expense makes one posted, paid bill with its receipt, even if sent twice', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    const uri = await keepPhoto('file:///cache/r.jpg');
    const change = expenseChange({ what: 'Jar lids', store: 'Lid Shop', date: '2026-11-26', amount: 12.5, accountId: 7, journalId: 1, uri }, 1700000000000);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    await runExpense(c, change.step as never);
    const bills = odoo.tables['account.move']!.filter((m) => m.move_type === 'in_invoice');
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ state: 'posted', ref: 'Lid Shop', payment_state: 'paid' });
    expect(odoo.tables['res.partner']!.filter((p) => p.name === 'Lid Shop')).toHaveLength(1);
    expect(odoo.tables['ir.attachment']).toHaveLength(1);
    expect(odoo.tables['ir.attachment']![0]).toMatchObject({ res_model: 'account.move', res_id: bills[0]!.id });
  });
});

describe('accountant packet', () => {
  test('one file with a section per report for the month', async () => {
    const { odoo } = bakery();
    const jelly = odoo.create('product.product', { name: 'Grape jelly', standard_price: 2 });
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 4, price_subtotal: 24, date: '2026-11-10 10:00:00', state: 'sale' });
    odoo.create('account.move', { name: 'INV/1', move_type: 'out_invoice', state: 'posted', payment_state: 'paid', invoice_date: '2026-11-10', amount_total: 24, amount_residual: 0, partner_id: [5, 'Anna'] });
    const p = await buildPacket(await client(odoo), '2026-11');
    expect(p.csv).toContain('Accountant packet 2026-11');
    expect(p.csv).toContain('Grape jelly,4,24.00,2.00');
    expect(p.csv).toContain('INV/1,Anna,2026-11-10');
    for (const t of ['Sales by product', 'Sales tax as booked', 'Cash in and out', 'Customer invoices', 'Purchase bills']) expect(p.csv).toContain(t);
  });
});
