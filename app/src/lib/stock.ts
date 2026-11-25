/**
 * Stock: count what is on the shelves, see what is close to its use-by date
 * (and throw it out), and find a batch: where it came from and where it went.
 *
 * Counts and throw-outs are saved in Odoo as an inventory count and a scrap,
 * through the offline queue. Finding a batch only reads. Nothing here turns on
 * an Odoo setting; products without batch numbers are counted as one line.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';
import { addDays } from './production';

type Client = Pick<OdooClient, 'call'>;

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');

export interface ProductRow {
  id: number;
  name: string;
}

/** Products matching what was typed, from Odoo. */
export async function searchProducts(c: Client, text: string): Promise<ProductRow[]> {
  const domain: unknown[] = text.trim() ? [['name', 'ilike', text.trim()]] : [];
  const fields = (await c.call('product.product', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  if ('is_storable' in fields) domain.push(['is_storable', '=', true]);
  const rows = (await c.call('product.product', 'search_read', [domain], { fields: ['name'], order: 'name asc', limit: 30 })) as { id: number; name: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export interface CountLine {
  quantId: number;
  lot: string;
  place: string;
  /** What Odoo says is there. */
  onHand: number;
}

/** What Odoo says is on the shelves for one product, by batch and place. */
export async function loadCountLines(c: Client, productId: number): Promise<CountLine[]> {
  const rows = (await c.call('stock.quant', 'search_read', [[['product_id', '=', productId], ['location_id.usage', '=', 'internal']]], { fields: ['lot_id', 'location_id', 'quantity'] })) as Record<string, unknown>[];
  return rows.map((r) => ({ quantId: r.id as number, lot: nameOf(r.lot_id), place: nameOf(r.location_id), onHand: Number(r.quantity ?? 0) }));
}

/**
 * The changes for one counted line: put the counted number in, then apply the
 * count so Odoo's stock matches. Applying is skipped if it is already applied.
 */
export function countChange(productName: string, line: CountLine, counted: number): NewChange {
  return {
    label: `Count ${productName}${line.lot ? ` batch ${line.lot}` : ''}: ${counted}`,
    model: 'stock.quant',
    method: 'write',
    args: [[line.quantId], { inventory_quantity: counted, inventory_quantity_set: true }],
    then: { method: 'action_apply_inventory', onlyWhen: [['inventory_quantity_set', '=', true]] },
  };
}

export interface ExpiringLot {
  id: number;
  lot: string;
  productId: number;
  product: string;
  useBy: string;
  qty: number;
  /** Days left; negative when it is past. */
  days: number;
}

const DAY = 86400000;
export function daysUntil(useBy: string, today = new Date()): number {
  const [y, m, d] = useBy.split('-').map(Number);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((new Date(y!, m! - 1, d!).getTime() - t) / DAY);
}

/** Batches with stock whose use-by date is within this many days (or already past), soonest first. */
export async function loadExpiring(c: Client, withinDays: number, today = new Date()): Promise<ExpiringLot[]> {
  const limit = `${addDays(today, withinDays)} 23:59:59`;
  const rows = (await c.call('stock.lot', 'search_read', [[['expiration_date', '!=', false], ['expiration_date', '<=', limit]]], { fields: ['name', 'product_id', 'expiration_date', 'product_qty'], order: 'expiration_date asc', limit: 100 })) as Record<string, unknown>[];
  return rows
    .map((r) => ({ id: r.id as number, lot: String(r.name), productId: m2oId(r.product_id), product: nameOf(r.product_id), useBy: day(r.expiration_date), qty: Number(r.product_qty ?? 0), days: daysUntil(day(r.expiration_date), today) }))
    .filter((l) => l.qty > 0);
}

/** Throw out a whole batch: makes the scrap in Odoo and validates it, so the stock comes off. */
export function throwOutChange(l: ExpiringLot, now = Date.now()): NewChange {
  const token = `food-app-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Throw out ${l.qty} ${l.product}, batch ${l.lot}`,
    model: 'stock.scrap',
    method: 'create',
    args: [{ product_id: l.productId, lot_id: l.id, scrap_qty: l.qty, origin: token }],
    already: { model: 'stock.scrap', domain: [['origin', '=', token]] },
    then: { method: 'action_validate', onlyWhen: [['state', '=', 'draft']] },
  };
}

export interface BatchTrace {
  lot: { id: number; name: string; product: string; useBy: string; onHand: number };
  /** The batch it was made in, and the ingredient batches that went into it. */
  madeIn: { name: string; ingredients: { product: string; lot: string }[] }[];
  /** Finished batches this one was used as an ingredient in. */
  usedIn: { name: string; product: string }[];
  /** Customer deliveries it went out on. */
  wentOutOn: { name: string; origin: string; customer: string; qty: number }[];
}

/** Batches whose number contains what was typed. */
export async function findLots(c: Client, text: string): Promise<{ id: number; name: string; product: string }[]> {
  if (!text.trim()) return [];
  const rows = (await c.call('stock.lot', 'search_read', [[['name', 'ilike', text.trim()]]], { fields: ['name', 'product_id'], limit: 20 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), product: nameOf(r.product_id) }));
}

/** Where a batch came from and where it went (for a recall). Reads only. */
export async function traceLot(c: Client, lotId: number): Promise<BatchTrace | null> {
  const [lot] = (await c.call('stock.lot', 'read', [[lotId]], { fields: ['name', 'product_id', 'expiration_date', 'product_qty'] })) as Record<string, unknown>[];
  if (!lot) return null;

  // Made in: the batch that produced it, and what went into that batch.
  const mos = (await c.call('mrp.production', 'search_read', [[['lot_producing_ids', 'in', [lotId]]]], { fields: ['name', 'move_raw_ids'] })) as Record<string, unknown>[];
  const madeIn: BatchTrace['madeIn'] = [];
  for (const mo of mos) {
    const moveIds = (mo.move_raw_ids as number[]) ?? [];
    const moves = moveIds.length ? ((await c.call('stock.move', 'read', [moveIds], { fields: ['move_line_ids'] })) as Record<string, unknown>[]) : [];
    const lineIds = moves.flatMap((m) => (m.move_line_ids as number[]) ?? []);
    const lines = lineIds.length ? ((await c.call('stock.move.line', 'read', [lineIds], { fields: ['product_id', 'lot_id'] })) as Record<string, unknown>[]) : [];
    madeIn.push({ name: String(mo.name), ingredients: lines.filter((l) => m2oId(l.lot_id)).map((l) => ({ product: nameOf(l.product_id), lot: nameOf(l.lot_id) })) });
  }

  // Everything this batch was moved on.
  const lines = (await c.call('stock.move.line', 'search_read', [[['lot_id', '=', lotId]]], { fields: ['move_id', 'picking_id', 'quantity'] })) as Record<string, unknown>[];

  // Used in: raw-material moves that took it into a batch.
  const moveIds = lines.map((l) => m2oId(l.move_id)).filter(Boolean);
  const moves = moveIds.length ? ((await c.call('stock.move', 'read', [moveIds], { fields: ['raw_material_production_id'] })) as Record<string, unknown>[]) : [];
  const moIds = [...new Set(moves.map((m) => m2oId(m.raw_material_production_id)).filter(Boolean))];
  const used = moIds.length ? ((await c.call('mrp.production', 'read', [moIds], { fields: ['name', 'product_id'] })) as Record<string, unknown>[]) : [];

  // Went out on: customer deliveries that are done.
  const pickIds = [...new Set(lines.map((l) => m2oId(l.picking_id)).filter(Boolean))];
  const picks = pickIds.length ? ((await c.call('stock.picking', 'read', [pickIds], { fields: ['name', 'origin', 'partner_id', 'picking_type_code', 'state'] })) as Record<string, unknown>[]) : [];
  const wentOutOn = picks
    .filter((p) => p.picking_type_code === 'outgoing' && p.state === 'done')
    .map((p) => ({
      name: String(p.name),
      origin: String(p.origin || ''),
      customer: nameOf(p.partner_id),
      qty: lines.filter((l) => m2oId(l.picking_id) === p.id).reduce((n, l) => n + Number(l.quantity ?? 0), 0),
    }));

  return {
    lot: { id: lotId, name: String(lot.name), product: nameOf(lot.product_id), useBy: day(lot.expiration_date), onHand: Number(lot.product_qty ?? 0) },
    madeIn,
    usedIn: used.map((m) => ({ name: String(m.name), product: nameOf(m.product_id) })),
    wentOutOn,
  };
}
