/**
 * Owner reports: sales by product, profit by product, stock value, this year
 * against last year, and a break-even helper. Reads only.
 *
 * Every price, cost, margin and value is Odoo's own number, shown side by side
 * (rule 1). The app only adds up Odoo's totals for a list and counts how many
 * units a typed fixed cost needs; it works out no price and no tax.
 *
 * Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export type Range = 'today' | 'week' | 'month' | 'lastmonth' | 'year';

export const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastmonth', label: 'Last month' },
  { id: 'year', label: 'This year' },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First and last day (YYYY-MM-DD) of a range. */
export function rangeDays(r: Range, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (r === 'today') return { from: ymd(now), to: ymd(now) };
  if (r === 'week') return { from: ymd(new Date(y, m, now.getDate() - 6)), to: ymd(now) };
  if (r === 'month') return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
  if (r === 'lastmonth') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
  return { from: `${y}-01-01`, to: ymd(now) };
}

export interface SoldRow {
  productId: number;
  name: string;
  units: number;
  /** The sum of Odoo's own line totals (before tax, as Odoo reports them). */
  sales: number;
  /** Odoo's own margin figure when this Odoo has it (the Margins app), else null. */
  margin: number | null;
  /** Odoo's cost for one unit now (the product's Cost). */
  cost: number;
}

const m2o = (v: unknown): [number, string] => (Array.isArray(v) ? [v[0] as number, String(v[1] ?? '')] : [0, '']);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Sold in the range: website and sales orders (Odoo's sales report) plus market sales (Point of Sale). */
export async function loadSold(c: Client, from: string, to: string): Promise<SoldRow[]> {
  const by = new Map<number, SoldRow>();
  const row = (id: number, name: string) => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { productId: id, name, units: 0, sales: 0, margin: null, cost: 0 }));
    return r;
  };
  // Delivery charges are not something that was made or sold from the kitchen; leave them out of the product lists.
  let shipping = new Set<number>();
  try {
    const car = (await c.call('delivery.carrier', 'search_read', [[]], { fields: ['product_id'] })) as Record<string, unknown>[];
    shipping = new Set(car.map((k) => m2o(k.product_id)[0]).filter(Boolean));
  } catch {
    // No delivery app in this Odoo.
  }
  const fields = (await c.call('sale.report', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  const hasMargin = 'margin' in fields;
  const sales = (await c.call('sale.report', 'search_read', [[['date', '>=', `${from} 00:00:00`], ['date', '<=', `${to} 23:59:59`], ['state', 'in', ['sale', 'done']]]], { fields: ['product_id', 'product_uom_qty', 'price_subtotal', ...(hasMargin ? ['margin'] : [])] })) as Record<string, unknown>[];
  for (const s of sales) {
    const [id, name] = m2o(s.product_id);
    if (!id || shipping.has(id)) continue;
    const r = row(id, name);
    r.units += num(s.product_uom_qty);
    r.sales += num(s.price_subtotal);
    if (hasMargin) r.margin = (r.margin ?? 0) + num(s.margin);
  }
  try {
    const pos = (await c.call('pos.order.line', 'search_read', [[['create_date', '>=', `${from} 00:00:00`], ['create_date', '<=', `${to} 23:59:59`]]], { fields: ['product_id', 'qty', 'price_subtotal'] })) as Record<string, unknown>[];
    for (const s of pos) {
      const [id, name] = m2o(s.product_id);
      if (!id) continue;
      const r = row(id, name);
      r.units += num(s.qty);
      r.sales += num(s.price_subtotal);
    }
  } catch {
    // No Point of Sale in this Odoo.
  }
  const ids = [...by.keys()];
  if (ids.length) {
    const costs = (await c.call('product.product', 'read', [ids], { fields: ['standard_price'] })) as { id: number; standard_price?: number }[];
    for (const p of costs) by.get(p.id)!.cost = num(p.standard_price);
  }
  return [...by.values()];
}

/** Best sellers first. */
export const bestFirst = (rows: SoldRow[]) => rows.slice().sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));

/** Sellable products that sold nothing in the range, then the slowest sellers. */
export async function slowest(c: Client, sold: SoldRow[], count = 5): Promise<{ name: string; units: number }[]> {
  const all = (await c.call('product.product', 'search_read', [[['sale_ok', '=', true]]], { fields: ['display_name', 'name'], order: 'name asc, id asc', limit: 300 })) as Record<string, unknown>[];
  const units = new Map(sold.map((s) => [s.productId, s.units]));
  return all
    .map((p) => ({ name: String(p.display_name || p.name), units: units.get(p.id as number) ?? 0 }))
    .sort((a, b) => a.units - b.units || a.name.localeCompare(b.name))
    .slice(0, count);
}

export interface StockValue {
  total: number;
  rows: { name: string; qty: number; value: number }[];
  /** False when this Odoo does not give a value on stock lines. */
  known: boolean;
}

/** What is on the shelves worth, from Odoo's own value on each stock line. */
export async function loadStockValue(c: Client): Promise<StockValue> {
  const fields = (await c.call('stock.quant', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  if (!('value' in fields)) return { total: 0, rows: [], known: false };
  const quants = (await c.call('stock.quant', 'search_read', [[['location_id.usage', '=', 'internal']]], { fields: ['product_id', 'quantity', 'value'] })) as Record<string, unknown>[];
  const by = new Map<number, { name: string; qty: number; value: number }>();
  for (const q of quants) {
    const [id, name] = m2o(q.product_id);
    if (!id) continue;
    const r = by.get(id) ?? { name, qty: 0, value: 0 };
    r.qty += num(q.quantity);
    r.value += num(q.value);
    by.set(id, r);
  }
  const rows = [...by.values()].sort((a, b) => b.value - a.value);
  return { total: rows.reduce((n, r) => n + r.value, 0), rows, known: true };
}

/** Sales per month for this year and last year. */
export async function loadYears(c: Client, now = new Date()): Promise<{ thisYear: number[]; lastYear: number[]; year: number }> {
  const year = now.getFullYear();
  const one = async (y: number) => {
    const rows = (await c.call('sale.report', 'search_read', [[['date', '>=', `${y}-01-01 00:00:00`], ['date', '<=', `${y}-12-31 23:59:59`], ['state', 'in', ['sale', 'done']]]], { fields: ['date', 'price_subtotal'] })) as Record<string, unknown>[];
    const months = new Array<number>(12).fill(0);
    for (const r of rows) {
      const m = Number(String(r.date ?? '').slice(5, 7)) - 1;
      if (m >= 0 && m < 12) months[m]! += num(r.price_subtotal);
    }
    return months;
  };
  return { year, thisYear: await one(year), lastYear: await one(year - 1) };
}

export interface BreakEvenProduct {
  id: number;
  name: string;
  price: number;
  cost: number;
}

export async function findForBreakEven(c: Client, text: string): Promise<BreakEvenProduct[]> {
  const rows = (await c.call('product.product', 'search_read', [[['sale_ok', '=', true], ...(text.trim() ? [['name', 'ilike', text.trim()]] : [])]], { fields: ['display_name', 'name', 'list_price', 'standard_price'], order: 'name asc, id asc', limit: 30 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.display_name || r.name), price: num(r.list_price), cost: num(r.standard_price) }));
}

/** How many units pay for a fixed cost, or null when the price does not beat the cost. A count, not a forecast. */
export function breakEvenUnits(fixedCost: number, price: number, cost: number): number | null {
  const each = price - cost;
  if (!(fixedCost > 0) || !(each > 0)) return null;
  return Math.ceil(fixedCost / each);
}
