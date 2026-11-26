/**
 * Website orders: see what is waiting to be packed, pack it taking the batch
 * that expires first, and hand it over (delivered or picked up).
 *
 * In Odoo a website order is a sale order, and what gets packed is its
 * delivery (stock.picking). Handing over is validating that delivery, which
 * takes the stock off the batches used. Nothing about prices or taxes is read
 * or worked out here. Every save is a change for the offline queue.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface Order {
  id: number;
  /** The delivery's name, for example WH/OUT/00012. */
  name: string;
  /** The sale order it came from, for example S00012. */
  origin: string;
  customer: string;
  /** assigned = ready to pack, confirmed/waiting = Odoo is waiting for stock. */
  state: string;
  date: string;
}

export interface PackLine {
  moveId: number;
  productId: number;
  name: string;
  qty: number;
  /** Where it comes from and where it goes, kept to put on the lines we write. */
  from: number;
  to: number;
  /** What Odoo has set aside now. */
  current: { lotId: number; lot: string; qty: number }[];
}

export interface LotStock {
  lotId: number;
  lot: string;
  useBy: string;
  qty: number;
}

export interface LotPick {
  lotId: number;
  lot: string;
  useBy: string;
  qty: number;
  /** True when the use-by date has already passed. */
  expired?: boolean;
}

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');

export const readyToPack = (o: Order) => o.state === 'assigned';

export function stateWords(state: string): string {
  return state === 'assigned' ? 'Ready to pack' : 'Waiting for stock';
}

/** Website deliveries not yet handed over, oldest first. */
export async function loadOrders(c: Client): Promise<Order[]> {
  const rows = (await c.call('stock.picking', 'search_read', [[['picking_type_code', '=', 'outgoing'], ['state', 'in', ['assigned', 'confirmed', 'waiting']], ['sale_id.website_id', '!=', false]]], {
    fields: ['name', 'origin', 'partner_id', 'state', 'scheduled_date'],
    order: 'scheduled_date asc, id asc',
    limit: 100,
  })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name ?? ''), origin: String(r.origin || ''), customer: nameOf(r.partner_id), state: String(r.state), date: typeof r.scheduled_date === 'string' ? r.scheduled_date.slice(0, 10) : '' }));
}

export async function loadPackLines(c: Client, pickingId: number): Promise<PackLine[]> {
  const moves = (await c.call('stock.move', 'search_read', [[['picking_id', '=', pickingId]]], { fields: ['product_id', 'product_uom_qty', 'location_id', 'location_dest_id', 'move_line_ids'] })) as Record<string, unknown>[];
  const lineIds = moves.flatMap((m) => (m.move_line_ids as number[]) ?? []);
  const lines = lineIds.length ? ((await c.call('stock.move.line', 'read', [lineIds], { fields: ['move_id', 'lot_id', 'quantity'] })) as Record<string, unknown>[]) : [];
  return moves.map((m) => ({
    moveId: m.id as number,
    productId: m2oId(m.product_id),
    name: nameOf(m.product_id),
    qty: Number(m.product_uom_qty ?? 0),
    from: m2oId(m.location_id),
    to: m2oId(m.location_dest_id),
    current: lines.filter((l) => m2oId(l.move_id) === m.id && m2oId(l.lot_id)).map((l) => ({ lotId: m2oId(l.lot_id), lot: nameOf(l.lot_id), qty: Number(l.quantity ?? 0) })),
  }));
}

/** The batches on the shelves for a product, with their use-by dates. Products with no batch numbers give an empty list. */
export async function loadLotStock(c: Client, productId: number | number[]): Promise<LotStock[]> {
  const quants = (await c.call('stock.quant', 'search_read', [[Array.isArray(productId) ? ['product_id', 'in', productId] : ['product_id', '=', productId], ['location_id.usage', '=', 'internal'], ['quantity', '>', 0], ['lot_id', '!=', false]]], { fields: ['lot_id', 'quantity'] })) as Record<string, unknown>[];
  const byLot = new Map<number, number>();
  for (const q of quants) byLot.set(m2oId(q.lot_id), (byLot.get(m2oId(q.lot_id)) ?? 0) + Number(q.quantity ?? 0));
  if (!byLot.size) return [];
  const lots = (await c.call('stock.lot', 'read', [[...byLot.keys()]], { fields: ['name', 'expiration_date'] })) as Record<string, unknown>[];
  return lots.map((l) => ({ lotId: l.id as number, lot: String(l.name), useBy: typeof l.expiration_date === 'string' ? l.expiration_date.slice(0, 10) : '', qty: byLot.get(l.id as number) ?? 0 }));
}

/**
 * Takes the amount needed from the batches that expire first. Batches with no
 * use-by date come after those, and batches already past their use-by come
 * last, so they are only used when nothing else can fill the order (and are
 * marked expired). Returns what it could cover and how much is still short.
 */
export function oldestFirst(stock: LotStock[], qty: number, today = new Date().toISOString().slice(0, 10)): { picks: LotPick[]; short: number } {
  const past = (s: LotStock) => !!s.useBy && s.useBy < today;
  const order = [...stock].sort((a, b) => Number(past(a)) - Number(past(b)) || (a.useBy || '9999-99-99').localeCompare(b.useBy || '9999-99-99') || a.lot.localeCompare(b.lot));
  const picks: LotPick[] = [];
  let left = qty;
  for (const s of order) {
    if (left <= 0) break;
    const take = Math.min(left, s.qty);
    if (take > 0) picks.push({ lotId: s.lotId, lot: s.lot, useBy: s.useBy, qty: take, ...(past(s) ? { expired: true } : {}) });
    left -= take;
  }
  return { picks, short: Math.max(0, Math.round(left * 1000) / 1000) };
}

/** True when what Odoo set aside is already the same batches. */
export const samePicks = (current: PackLine['current'], picks: LotPick[]) =>
  current.length === picks.length && picks.every((p) => current.some((c) => c.lotId === p.lotId && Math.abs(c.qty - p.qty) < 0.0001));

export type Handover = 'delivery' | 'pickup';

/**
 * The changes that pack and hand over one delivery, in order: switch each
 * line to the batches picked (only where they differ from what Odoo set aside),
 * leave a note saying delivered or picked up, then validate the delivery.
 * Each is skipped if the delivery is already done in Odoo.
 */
export function handOverChanges(order: Order, lines: { line: PackLine; picks: LotPick[] }[], how: Handover): NewChange[] {
  const already = { model: 'stock.picking', domain: [['id', '=', order.id], ['state', '=', 'done']] };
  const out: NewChange[] = [];
  for (const { line, picks } of lines) {
    if (!picks.length || samePicks(line.current, picks)) continue;
    out.push({
      label: `Batches for ${line.name} on ${order.name}`,
      model: 'stock.move',
      method: 'write',
      args: [[line.moveId], { move_line_ids: [[5, 0, 0], ...picks.map((p) => [0, 0, { product_id: line.productId, lot_id: p.lotId, quantity: p.qty, location_id: line.from, location_dest_id: line.to, picked: true }])] }],
      already,
    });
  }
  out.push({
    label: `Note on ${order.name}: ${how === 'pickup' ? 'picked up' : 'delivered'}`,
    model: 'stock.picking',
    method: 'message_post',
    args: [[order.id]],
    kwargs: { body: how === 'pickup' ? 'Picked up by the customer (food app).' : 'Delivered to the customer (food app).', message_type: 'comment', subtype_xmlid: 'mail.mt_note' },
    already,
  });
  out.push({ label: `Hand over ${order.name}`, model: 'stock.picking', method: 'button_validate', args: [[order.id]], kwargs: { context: { skip_backorder: true, skip_sms: true, skip_immediate: true } }, already });
  return out;
}

