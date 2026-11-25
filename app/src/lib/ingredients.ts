/**
 * Ingredients: see what is running low, set the levels that mean "low", order
 * from a supplier, and check a delivery in when it arrives.
 *
 * In Odoo "low" is a reorder rule (stock.warehouse.orderpoint: a minimum and a
 * maximum), an order is a purchase order, and a delivery arriving is a receipt
 * (stock.picking, incoming). Prices come from Odoo: the app sends a product and
 * a quantity and Odoo fills the price from the supplier's price list. Nothing
 * is sent to the supplier by the app (no emails or texts); it only confirms
 * the order in Odoo.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';
import { searchProducts } from './stock';

type Client = Pick<OdooClient, 'call'>;

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const num = (v: unknown) => Number(v ?? 0) || 0;

export interface LowItem {
  ruleId: number;
  productId: number;
  name: string;
  unit: string;
  onHand: number;
  min: number;
  max: number;
  /** A starting amount to order. The person can change it. */
  suggest: number;
}

/** The reorder rules in Odoo. `lowOnly` keeps those at or under their minimum. */
export async function loadRules(c: Client, lowOnly: boolean): Promise<LowItem[]> {
  const rows = (await c.call('stock.warehouse.orderpoint', 'search_read', [[]], { fields: ['product_id', 'product_min_qty', 'product_max_qty', 'qty_on_hand', 'qty_forecast', 'qty_to_order', 'product_uom_name'], limit: 200 })) as Record<string, unknown>[];
  const items = rows.map((r) => {
    const max = num(r.product_max_qty);
    const forecast = r.qty_forecast === undefined ? num(r.qty_on_hand) : num(r.qty_forecast);
    return {
      ruleId: r.id as number,
      productId: m2oId(r.product_id),
      name: nameOf(r.product_id),
      unit: typeof r.product_uom_name === 'string' ? r.product_uom_name : '',
      onHand: num(r.qty_on_hand),
      min: num(r.product_min_qty),
      max,
      suggest: Math.max(num(r.qty_to_order), max - forecast, 0),
    };
  });
  return (lowOnly ? items.filter((i) => i.onHand <= i.min) : items).sort((a, b) => a.onHand - a.min - (b.onHand - b.min) || a.name.localeCompare(b.name));
}

/** Sets "low" and "full" levels for a product: changes its rule in Odoo, or makes one. */
export function setLevelsChange(productName: string, productId: number, min: number, max: number, ruleId: number | null): NewChange {
  if (ruleId) return { label: `Levels for ${productName}: ${min} to ${max}`, model: 'stock.warehouse.orderpoint', method: 'write', args: [[ruleId], { product_min_qty: min, product_max_qty: max }] };
  return {
    label: `Levels for ${productName}: ${min} to ${max}`,
    model: 'stock.warehouse.orderpoint',
    method: 'create',
    args: [{ product_id: productId, product_min_qty: min, product_max_qty: max }],
    already: { model: 'stock.warehouse.orderpoint', domain: [['product_id', '=', productId]] },
  };
}

export interface Supplier {
  id: number;
  name: string;
}

/** The suppliers Odoo has on a product's price list. */
export async function usualSuppliers(c: Client, productId: number): Promise<Supplier[]> {
  const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['product_tmpl_id'] })) as Record<string, unknown>[];
  const rows = (await c.call('product.supplierinfo', 'search_read', [[['product_tmpl_id', '=', m2oId(p?.product_tmpl_id)]]], { fields: ['partner_id'] })) as Record<string, unknown>[];
  const seen = new Set<number>();
  return rows.map((r) => ({ id: m2oId(r.partner_id), name: nameOf(r.partner_id) })).filter((s) => s.id && !seen.has(s.id) && seen.add(s.id));
}

/** Contacts by name, for picking a supplier. */
export async function searchSuppliers(c: Client, text: string): Promise<Supplier[]> {
  const rows = (await c.call('res.partner', 'search_read', [text.trim() ? [['name', 'ilike', text.trim()]] : []], { fields: ['name'], order: 'name asc', limit: 20 })) as { id: number; name: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** A new supplier contact. Needs signal, because the order is made for it straight after. */
export function newSupplierChange(name: string, phone: string, email: string): NewChange {
  return {
    label: `New supplier: ${name.trim()}`,
    model: 'res.partner',
    method: 'create',
    args: [{ name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}), company_type: 'company' }],
    already: { model: 'res.partner', domain: [['name', '=', name.trim()]] },
  };
}

export interface OrderLine {
  productId: number;
  name: string;
  qty: number;
  /** Price each as typed (Bought ingredients). Left out, Odoo fills it from the supplier's price list. */
  price?: number;
  /** The unit picked for this line, when it is not the product's own. */
  uomId?: number;
}

/**
 * The change that places an order: a purchase order to the supplier with these
 * lines, confirmed in Odoo. Odoo fills in the prices. A token in `origin` lets
 * a retry find the order if the first send got there but the answer was lost.
 */
export function placeOrderChange(supplier: Supplier, lines: OrderLine[], now = Date.now()): NewChange {
  const token = `food-app-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Order from ${supplier.name}: ${lines.map((l) => `${l.qty} ${l.name}`).join(', ')}`,
    model: 'purchase.order',
    method: 'create',
    args: [{ partner_id: supplier.id, origin: token, order_line: lines.map((l) => [0, 0, { product_id: l.productId, product_qty: l.qty, ...(l.price !== undefined ? { price_unit: l.price } : {}), ...(l.uomId ? { product_uom_id: l.uomId } : {}) }]) }],
    already: { model: 'purchase.order', domain: [['origin', '=', token]] },
    then: { method: 'button_confirm', onlyWhen: [['state', 'in', ['draft', 'sent']]] },
  };
}

/** A purchase made at a shop: what was bought, with what was paid and what came. */
export interface BoughtLine extends OrderLine {
  lot: string;
  useBy: string;
}

/** An ingredient to pick on "Bought ingredients", with what the form needs to know about it. */
export interface Choice {
  id: number;
  name: string;
  /** The unit's name, and its id in Odoo. */
  unit: string;
  uomId: number;
  /** True when the product has batch numbers, so a number is asked for. */
  tracked: boolean;
}

/** Ingredients (raw materials, or all products) by name, with their unit and whether they have batch numbers. */
export async function loadChoices(c: Client, text: string, all: boolean): Promise<Choice[]> {
  const found = await searchProducts(c, text, false, !all);
  if (!found.length) return [];
  const rows = (await c.call('product.product', 'read', [found.map((f) => f.id)], { fields: ['tracking', 'uom_id'] })) as { id: number; tracking?: string; uom_id?: unknown }[];
  return found.map((f) => {
    const r = rows.find((x) => x.id === f.id);
    return { id: f.id, name: f.name, unit: nameOf(r?.uom_id), uomId: m2oId(r?.uom_id), tracked: r?.tracking === 'lot' };
  });
}

export interface Journal {
  id: number;
  name: string;
}

/** The ways to pay Odoo has (its cash and bank journals), for "Bought ingredients". Empty when there is no Accounting app. */
export async function loadJournals(c: Client): Promise<Journal[]> {
  try {
    const rows = (await c.call('account.journal', 'search_read', [[['type', 'in', ['cash', 'bank']]]], { fields: ['name'], order: 'name asc', limit: 20 })) as { id: number; name: string }[];
    return rows.map((r) => ({ id: r.id, name: String(r.name) }));
  } catch {
    return [];
  }
}

/** The last price paid for a product on a confirmed order, or null. A starting guess the person can change. */
export async function lastPricePaid(c: Client, productId: number): Promise<number | null> {
  try {
    const [r] = (await c.call('purchase.order.line', 'search_read', [[['product_id', '=', productId], ['state', 'in', ['purchase', 'done']]]], { fields: ['price_unit'], order: 'id desc', limit: 1 })) as { price_unit?: number }[];
    return typeof r?.price_unit === 'number' ? r.price_unit : null;
  } catch {
    return null;
  }
}

/**
 * "Bought ingredients": one chain for a shopping trip, kept in order in the
 * offline queue: make and confirm the purchase order (with the price paid on
 * each line), receive the delivery Odoo makes for it, then make the vendor bill
 * and mark it paid. `journalId` null leaves the bill open ("not paid yet"), and
 * `billing` false (no Accounting app) stops after receiving.
 */
export function boughtChanges(supplier: Supplier, lines: BoughtLine[], opts: { billing: boolean; journalId: number | null; date: string }, now = Date.now()): NewChange[] {
  const order = placeOrderChange(supplier, lines, now);
  const token = (order.args[0] as { origin: string }).origin;
  const label = `${supplier.name}: ${lines.map((l) => `${l.qty} ${l.name}`).join(', ')}`;
  const out: NewChange[] = [{ ...order, label: `Bought from ${label}` }];
  out.push({
    label: `Receive purchase from ${supplier.name}`,
    model: 'purchase.order',
    method: 'receive',
    args: [],
    step: { kind: 'receive', token, lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, lot: l.lot, useBy: l.useBy })) },
  });
  if (opts.billing) out.push({ label: `${opts.journalId === null ? 'Bill' : 'Paid bill'} for ${supplier.name}`, model: 'purchase.order', method: 'bill', args: [], step: { kind: 'bill', token, date: opts.date, journalId: opts.journalId } });
  return out;
}

export interface Receipt {
  id: number;
  name: string;
  origin: string;
  supplier: string;
}

/** Deliveries from suppliers that Odoo expects and has not been checked in. */
export async function loadReceipts(c: Client): Promise<Receipt[]> {
  const rows = (await c.call('stock.picking', 'search_read', [[['picking_type_code', '=', 'incoming'], ['state', '=', 'assigned']]], { fields: ['name', 'origin', 'partner_id'], order: 'scheduled_date asc, id asc', limit: 50 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), origin: String(r.origin || ''), supplier: nameOf(r.partner_id) }));
}

export interface ReceiptLine {
  moveId: number;
  productId: number;
  name: string;
  ordered: number;
  /** True when this product has batch numbers, so a number and use-by date are asked for. */
  tracked: boolean;
  from: number;
  to: number;
  /** The order line this delivery line came from, and the price per unit on it (null if none). */
  orderLineId: number | null;
  price: number | null;
}

export async function loadReceiptLines(c: Client, pickingId: number): Promise<ReceiptLine[]> {
  const moves = (await c.call('stock.move', 'search_read', [[['picking_id', '=', pickingId]]], { fields: ['product_id', 'product_uom_qty', 'location_id', 'location_dest_id', 'purchase_line_id'] })) as Record<string, unknown>[];
  const orderIds = moves.map((m) => m2oId(m.purchase_line_id)).filter((x) => x > 0);
  let prices: { id: number; price_unit?: number }[] = [];
  if (orderIds.length) {
    try {
      prices = (await c.call('purchase.order.line', 'read', [orderIds], { fields: ['price_unit'] })) as { id: number; price_unit?: number }[];
    } catch {
      prices = [];
    }
  }
  const ids = moves.map((m) => m2oId(m.product_id));
  const prods = ids.length ? ((await c.call('product.product', 'read', [ids], { fields: ['tracking'] })) as { id: number; tracking?: string }[]) : [];
  return moves.map((m) => ({
    moveId: m.id as number,
    productId: m2oId(m.product_id),
    name: nameOf(m.product_id),
    ordered: num(m.product_uom_qty),
    tracked: prods.find((p) => p.id === m2oId(m.product_id))?.tracking === 'lot',
    from: m2oId(m.location_id),
    to: m2oId(m.location_dest_id),
    orderLineId: m2oId(m.purchase_line_id) > 0 ? m2oId(m.purchase_line_id) : null,
    price: prices.find((p) => p.id === m2oId(m.purchase_line_id))?.price_unit ?? null,
  }));
}

export interface Arrived {
  line: ReceiptLine;
  qty: number;
  lot: string;
  useBy: string;
  /** Price per unit as typed at check-in. Left out or equal to the order's price means no change. */
  price?: number;
}

export function lineValues(a: Arrived): Record<string, unknown> {
  const v: Record<string, unknown> = { product_id: a.line.productId, quantity: a.qty, location_id: a.line.from, location_dest_id: a.line.to, picked: true };
  if (a.line.tracked && a.lot) {
    v.lot_name = a.lot;
    if (a.useBy) v.expiration_date = `${a.useBy} 12:00:00`;
  }
  return v;
}

/**
 * The changes that check a delivery in: put what arrived (with the supplier's
 * batch number and use-by date, where the product has them) on each line, then
 * validate. If less arrived than was ordered, Odoo keeps the rest waiting.
 * Skipped if the delivery is already done in Odoo.
 */
export function checkInChanges(receipt: Receipt, arrived: Arrived[]): NewChange[] {
  const already = { model: 'stock.picking', domain: [['id', '=', receipt.id], ['state', '=', 'done']] };
  const out: NewChange[] = [];
  // What was paid goes on the order line first, so Odoo works out the cost from it when the delivery is validated.
  for (const a of arrived) {
    if (a.price === undefined || a.line.orderLineId === null || a.price === a.line.price) continue;
    out.push({ label: `Price of ${a.line.name} on ${receipt.name}: ${a.price}`, model: 'purchase.order.line', method: 'write', args: [[a.line.orderLineId], { price_unit: a.price }], already });
  }
  for (const a of arrived) {
    out.push({
      label: `Received ${a.qty} ${a.line.name} on ${receipt.name}`,
      model: 'stock.move',
      method: 'write',
      args: [[a.line.moveId], { move_line_ids: [[5, 0, 0], [0, 0, lineValues(a)]] }],
      already,
    });
  }
  out.push({ label: `Check in ${receipt.name}`, model: 'stock.picking', method: 'button_validate', args: [[receipt.id]], kwargs: { context: { skip_backorder: true, skip_sms: true, skip_immediate: true } }, already });
  return out;
}

export interface PurchaseRow {
  id: number;
  name: string;
  vendor: string;
  state: string;
  date: string;
}

/** Recent purchase orders, newest first. */
export async function loadPurchaseOrders(c: Pick<OdooClient, 'call'>): Promise<PurchaseRow[]> {
  const rows = (await c.call('purchase.order', 'search_read', [[]], { fields: ['name', 'partner_id', 'state', 'date_order'], order: 'id desc', limit: 30 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), vendor: Array.isArray(r.partner_id) ? String(r.partner_id[1]) : '', state: String(r.state ?? ''), date: typeof r.date_order === 'string' ? r.date_order.slice(0, 10) : '' }));
}

export const poStateLabel = (s: string) => ({ draft: 'Quote', sent: 'Quote sent', 'to approve': 'To approve', purchase: 'Ordered', done: 'Done', cancel: 'Cancelled' })[s] ?? s;
