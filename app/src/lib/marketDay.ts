/**
 * Market day tools around Odoo's Point of Sale: results after closing, a day
 * sheet of what sold last time, check-out and check-in counts, a price sheet,
 * a cash drawer count and day totals for Cash App and Venmo.
 *
 * Sales, totals and payments are Odoo's own, read only. What a person types
 * (what they took to market, drawer counts, app totals) is saved as lines in
 * the Food app settings contact and never written into the Point of Sale.
 * Stock in Odoo is not changed by these screens.
 *
 * Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const m2o = (v: unknown): [number, string] => (Array.isArray(v) ? [v[0] as number, String(v[1] ?? '')] : [0, '']);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export interface Session {
  id: number;
  name: string;
  register: string;
  start: string;
  stop: string;
  state: string;
  cashStart: number;
  cashEnd: number;
}

/** The latest days at the register, newest first. */
export async function loadSessions(c: Client, limit = 10): Promise<Session[]> {
  const rows = (await c.call('pos.session', 'search_read', [[]], { fields: ['name', 'config_id', 'start_at', 'stop_at', 'state', 'cash_register_balance_start', 'cash_register_balance_end_real'], order: 'id desc', limit })) as Record<string, unknown>[];
  return rows.slice().sort((a, b) => (b.id as number) - (a.id as number)).map((r) => ({ id: r.id as number, name: str(r.name), register: m2o(r.config_id)[1], start: str(r.start_at), stop: str(r.stop_at), state: str(r.state), cashStart: num(r.cash_register_balance_start), cashEnd: num(r.cash_register_balance_end_real) }));
}

export interface SessionResults {
  session: Session;
  orders: number;
  /** The sum of Odoo's own order totals. */
  total: number;
  byWay: { way: string; amount: number }[];
  best: { name: string; qty: number }[];
  /** Stock on hand now of what sold. */
  leftovers: { name: string; onHand: number }[];
}

export async function loadResults(c: Client, session: Session): Promise<SessionResults> {
  const orders = (await c.call('pos.order', 'search_read', [[['session_id', '=', session.id]]], { fields: ['amount_total'] })) as Record<string, unknown>[];
  const pays = (await c.call('pos.payment', 'search_read', [[['session_id', '=', session.id]]], { fields: ['payment_method_id', 'amount'] })) as Record<string, unknown>[];
  const lines = orders.length ? ((await c.call('pos.order.line', 'search_read', [[['order_id', 'in', orders.map((o) => o.id)]]], { fields: ['product_id', 'qty'] })) as Record<string, unknown>[]) : [];
  const way = new Map<string, number>();
  for (const p of pays) {
    const n = m2o(p.payment_method_id)[1] || 'Other';
    way.set(n, (way.get(n) ?? 0) + num(p.amount));
  }
  const sold = new Map<number, { name: string; qty: number }>();
  for (const l of lines) {
    const [id, name] = m2o(l.product_id);
    if (!id) continue;
    const r = sold.get(id) ?? { name, qty: 0 };
    r.qty += num(l.qty);
    sold.set(id, r);
  }
  const ids = [...sold.keys()];
  const stock = ids.length ? ((await c.call('product.product', 'read', [ids], { fields: ['qty_available'] })) as { id: number; qty_available?: number }[]) : [];
  return {
    session,
    orders: orders.length,
    total: orders.reduce((n, o) => n + num(o.amount_total), 0),
    byWay: [...way.entries()].map(([w, amount]) => ({ way: w, amount })).sort((a, b) => a.way.localeCompare(b.way)),
    best: [...sold.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
    leftovers: ids.map((id) => ({ name: sold.get(id)!.name, onHand: num(stock.find((s) => s.id === id)?.qty_available) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface DaySheetRow {
  productId: number;
  name: string;
  /** Units sold at each of the last markets, newest first. */
  last: number[];
  onHand: number;
}

/** What sold at the last few markets side by side, and what is in stock now. Shows numbers only, no forecast. */
export async function loadDaySheet(c: Client, markets = 3): Promise<{ rows: DaySheetRow[]; dates: string[] }> {
  const sessions = (await loadSessions(c, 30)).filter((s) => s.state === 'closed').slice(0, markets);
  const by = new Map<number, DaySheetRow>();
  for (let i = 0; i < sessions.length; i++) {
    const orders = (await c.call('pos.order', 'search_read', [[['session_id', '=', sessions[i]!.id]]], { fields: ['id'] })) as { id: number }[];
    const lines = orders.length ? ((await c.call('pos.order.line', 'search_read', [[['order_id', 'in', orders.map((o) => o.id)]]], { fields: ['product_id', 'qty'] })) as Record<string, unknown>[]) : [];
    for (const l of lines) {
      const [id, name] = m2o(l.product_id);
      if (!id) continue;
      const r = by.get(id) ?? { productId: id, name, last: new Array<number>(sessions.length).fill(0), onHand: 0 };
      r.last[i]! += num(l.qty);
      by.set(id, r);
    }
  }
  const ids = [...by.keys()];
  const stock = ids.length ? ((await c.call('product.product', 'read', [ids], { fields: ['qty_available'] })) as { id: number; qty_available?: number }[]) : [];
  for (const r of by.values()) r.onHand = num(stock.find((s) => s.id === r.productId)?.qty_available);
  return { rows: [...by.values()].sort((a, b) => (b.last[0] ?? 0) - (a.last[0] ?? 0) || a.name.localeCompare(b.name)), dates: sessions.map((s) => (s.stop || s.start).slice(0, 10)) };
}

export interface PriceRow {
  id: number;
  name: string;
  price: number;
}

/** What is sold at the register, with the list price Odoo has. Tax is not touched. */
export async function loadPriceSheet(c: Client): Promise<PriceRow[]> {
  const fields = (await c.call('product.product', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  const domain: unknown[] = [['sale_ok', '=', true]];
  if ('available_in_pos' in fields) domain.push(['available_in_pos', '=', true]);
  const rows = (await c.call('product.product', 'search_read', [domain], { fields: ['display_name', 'name', 'list_price'], order: 'name asc, id asc', limit: 200 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.display_name) || str(r.name), price: num(r.list_price) }));
}

export const priceSheetText = (rows: PriceRow[], title: string) => `${title}\n\n${rows.map((r) => `${r.name}  ${r.price.toFixed(2)}`).join('\n')}`;

// Typed records: one settings line each, keyed by the market day.
export const marketKey = (date: string) => `market.${date}`;
export const drawerKey = (date: string, when: 'open' | 'close') => `drawer.${date}.${when}`;
export const totalsKey = (date: string) => `daytotals.${date}`;

export interface TakeRow {
  productId: number;
  name: string;
  out: string;
  back: string;
}

/** "5|Name|12|3;7|Other|6|" — product id, name, taken, came back. */
export const takeToLine = (rows: TakeRow[]) => rows.map((r) => [r.productId, r.name.replace(/[|;=<&]/g, ' '), r.out, r.back].join('|')).join(';');
export function takeFromLine(line: string | undefined): TakeRow[] {
  if (!line) return [];
  return line
    .split(';')
    .map((p) => p.split('|'))
    .filter((p) => p.length >= 4 && Number(p[0]))
    .map((p) => ({ productId: Number(p[0]), name: p[1]!, out: p[2]!, back: p[3]! }));
}

const toNum = (t: string) => Number(t.replace(',', '.')) || 0;

/** Taken minus came back is what was left to sell; compared with what Odoo says sold. */
export function sellThrough(row: TakeRow, sold: number) {
  const left = toNum(row.out) - toNum(row.back);
  return { left, sold, gap: left - sold };
}

export const DENOMS = [
  { id: 'b100', label: '$100 bills', value: 100 },
  { id: 'b50', label: '$50 bills', value: 50 },
  { id: 'b20', label: '$20 bills', value: 20 },
  { id: 'b10', label: '$10 bills', value: 10 },
  { id: 'b5', label: '$5 bills', value: 5 },
  { id: 'b1', label: '$1 bills', value: 1 },
  { id: 'c25', label: 'Quarters', value: 0.25 },
  { id: 'c10', label: 'Dimes', value: 0.1 },
  { id: 'c5', label: 'Nickels', value: 0.05 },
  { id: 'c1', label: 'Pennies', value: 0.01 },
];

/** The drawer total from counts typed per bill or coin. Whole cents. */
export function drawerTotal(counts: Record<string, string>): number {
  return Math.round(DENOMS.reduce((n, d) => n + Math.round(d.value * 100) * Math.max(0, Math.floor(toNum(counts[d.id] ?? ''))), 0)) / 100;
}

/** Counted against what Odoo says, with plain words. */
export function drawerWords(counted: number, odoo: number): string {
  const diff = Math.round((counted - odoo) * 100) / 100;
  if (diff === 0) return 'Matches Odoo.';
  return diff > 0 ? `${diff.toFixed(2)} more than Odoo says.` : `${(-diff).toFixed(2)} less than Odoo says.`;
}

/** "Cash App=25.5;Venmo=10" typed totals from the apps. */
export function totalsFromLine(line: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of (line ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return out;
}
export const totalsToLine = (t: Record<string, string>) =>
  Object.entries(t)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k.replace(/[;=<&]/g, ' ')}=${v.trim()}`)
    .join(';');

/** True when the typed app total equals Odoo's total for that way to pay, to the cent. */
export const totalsMatch = (typed: string, odoo: number) => typed.trim() !== '' && Math.round(toNum(typed) * 100) === Math.round(odoo * 100);
