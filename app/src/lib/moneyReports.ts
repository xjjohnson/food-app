/**
 * Owner money reports read from Odoo's own books: sales tax as booked, cash in
 * and out, bills due, the month goal, and budget against actual by category.
 *
 * Read only, and no tax or price is worked out here: tax lines are shown as
 * Odoo booked them (with the sign turned so tax collected reads as a plus).
 * The goal and budgets are typed by the owner and kept in the Food app
 * settings contact.
 *
 * Kept free of React; the client is passed in.
 */
import { loadMoney, MoneyRow } from './money';
import type { OdooClient } from './odoo';
import { rangeDays, Range } from './reports';

type Client = Pick<OdooClient, 'call'>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const m2o = (v: unknown): [number, string] => (Array.isArray(v) ? [v[0] as number, String(v[1] ?? '')] : [0, '']);

export interface TaxRow {
  month: string;
  tax: string;
  /** Sales tax collected (a plus) or tax paid on purchases (a minus), as booked. */
  amount: number;
  /** The amount the tax was charged on, as Odoo books it. */
  base: number;
}

/** Tax lines of posted entries in a year, by month and tax name. */
export async function loadTax(c: Client, year: number): Promise<TaxRow[]> {
  const lines = (await c.call('account.move.line', 'search_read', [[['tax_line_id', '!=', false], ['parent_state', '=', 'posted'], ['date', '>=', `${year}-01-01`], ['date', '<=', `${year}-12-31`]]], { fields: ['tax_line_id', 'balance', 'tax_base_amount', 'date'] })) as Record<string, unknown>[];
  const taxIds = [...new Set(lines.map((l) => m2o(l.tax_line_id)[0]).filter(Boolean))];
  const taxes = taxIds.length ? ((await c.call('account.tax', 'read', [taxIds], { fields: ['name', 'type_tax_use'] })) as { id: number; name: string; type_tax_use?: string }[]) : [];
  const by = new Map<string, TaxRow>();
  for (const l of lines) {
    const [id, name] = m2o(l.tax_line_id);
    const t = taxes.find((x) => x.id === id);
    // Odoo books sales tax as a credit (a minus balance); turn it so "collected" reads as a plus.
    const sign = t?.type_tax_use === 'sale' ? -1 : 1;
    const month = String(l.date ?? '').slice(0, 7);
    const key = `${month}|${name}`;
    const r = by.get(key) ?? { month, tax: name, amount: 0, base: 0 };
    r.amount += sign * num(l.balance);
    r.base += num(l.tax_base_amount);
    by.set(key, r);
  }
  return [...by.values()].sort((a, b) => b.month.localeCompare(a.month) || a.tax.localeCompare(b.tax));
}

export interface CashRow {
  way: string;
  cashIn: number;
  cashOut: number;
}

/** Money in and out by way of payment (journal or Point of Sale payment method) in a range. */
export const loadCash = (c: Client, range: Range, now = new Date()) => {
  const { from, to } = rangeDays(range, now);
  return loadCashDates(c, from, to);
};

/** The same for exact days (YYYY-MM-DD). */
export async function loadCashDates(c: Client, from: string, to: string): Promise<CashRow[]> {
  const by = new Map<string, CashRow>();
  const add = (way: string, inn: number, out: number) => {
    const r = by.get(way) ?? { way, cashIn: 0, cashOut: 0 };
    r.cashIn += inn;
    r.cashOut += out;
    by.set(way, r);
  };
  const pays = (await c.call('account.payment', 'search_read', [[['date', '>=', from], ['date', '<=', to], ['state', 'in', ['paid', 'in_process', 'posted']]]], { fields: ['journal_id', 'amount', 'payment_type'] })) as Record<string, unknown>[];
  for (const p of pays) add(m2o(p.journal_id)[1] || 'Other', p.payment_type === 'inbound' ? num(p.amount) : 0, p.payment_type === 'outbound' ? num(p.amount) : 0);
  try {
    const pos = (await c.call('pos.payment', 'search_read', [[['payment_date', '>=', `${from} 00:00:00`], ['payment_date', '<=', `${to} 23:59:59`]]], { fields: ['payment_method_id', 'amount'] })) as Record<string, unknown>[];
    for (const p of pos) add(`Market: ${m2o(p.payment_method_id)[1] || 'Other'}`, num(p.amount) > 0 ? num(p.amount) : 0, num(p.amount) < 0 ? -num(p.amount) : 0);
  } catch {
    // No Point of Sale.
  }
  return [...by.values()].sort((a, b) => a.way.localeCompare(b.way));
}

export interface DueBill extends MoneyRow {
  /** Days past the due date (more than 0 is late), or null with no due date. */
  late: number | null;
}

const days = (d: string) => Math.round((Date.parse(d) - 0) / 86400000);

/** Unpaid vendor bills, the soonest due first. */
export async function loadBillsDue(c: Client, now = new Date()): Promise<DueBill[]> {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rows = await loadMoney(c, 'in', { limit: 300 });
  return rows
    .filter((r) => !r.paid && r.state === 'posted')
    .map((r) => ({ ...r, late: r.due ? days(today) - days(r.due) : null }))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.id - b.id);
}

/** Goal progress: the typed goal and the sales total so far, as a whole percent. */
export const goalPercent = (goal: number, sold: number) => (goal > 0 ? Math.min(999, Math.round((sold / goal) * 100)) : 0);

export const GOAL_KEY = 'goal.month';
export const budgetKey = (categoryId: number) => `budget.${categoryId}`;

export interface BudgetRow {
  categoryId: number;
  name: string;
  budget: number;
  /** What was spent this month, as Odoo's bill lines total it. */
  actual: number;
}

/** Money spent by product category this month (posted vendor bill lines). */
export async function loadSpent(c: Client, now = new Date()): Promise<Map<number, { name: string; spent: number }>> {
  const { from, to } = rangeDays('month', now);
  const lines = (await c.call('account.move.line', 'search_read', [[['move_type', 'in', ['in_invoice', 'in_refund']], ['parent_state', '=', 'posted'], ['product_id', '!=', false], ['date', '>=', from], ['date', '<=', to]]], { fields: ['product_id', 'price_subtotal'] })) as Record<string, unknown>[];
  const pids = [...new Set(lines.map((l) => m2o(l.product_id)[0]))];
  const prods = pids.length ? ((await c.call('product.product', 'read', [pids], { fields: ['categ_id'] })) as { id: number; categ_id?: unknown }[]) : [];
  const out = new Map<number, { name: string; spent: number }>();
  for (const l of lines) {
    const p = prods.find((x) => x.id === m2o(l.product_id)[0]);
    const [cid, cname] = m2o(p?.categ_id);
    if (!cid) continue;
    const r = out.get(cid) ?? { name: cname, spent: 0 };
    r.spent += num(l.price_subtotal);
    out.set(cid, r);
  }
  return out;
}

export async function loadCategories(c: Client): Promise<{ id: number; name: string }[]> {
  const rows = (await c.call('product.category', 'search_read', [[]], { fields: ['complete_name', 'name'], order: 'complete_name asc, id asc', limit: 100 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.complete_name || r.name) }));
}

/** Budget and what was spent, for every category that has either. */
export function budgetRows(cats: { id: number; name: string }[], spent: Map<number, { name: string; spent: number }>, settings: Record<string, string>): BudgetRow[] {
  return cats
    .map((c) => ({ categoryId: c.id, name: c.name, budget: Number((settings[budgetKey(c.id)] ?? '').replace(',', '.')) || 0, actual: spent.get(c.id)?.spent ?? 0 }))
    .filter((r) => r.budget > 0 || r.actual > 0);
}
