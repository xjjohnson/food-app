/**
 * Production: start a batch from a recipe, see its ingredients, and finish it
 * with a batch number and a use-by date.
 *
 * In Odoo a batch is a manufacturing order (mrp.production), a recipe is a
 * bill of materials (mrp.bom), and a batch number is a lot (stock.lot). The
 * app only reads recipes and stock from Odoo and sends what a person did:
 * every save is a change for the offline queue (`NewChange`), never a direct
 * call. Nothing here switches on an Odoo setting; if Odoo isn't set up for
 * batch numbers or use-by dates, the screen says so.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export type BatchState = 'draft' | 'confirmed' | 'progress' | 'to_close' | 'done' | 'cancel';

export interface Batch {
  id: number;
  name: string;
  productId: number;
  product: string;
  qty: number;
  unit: string;
  state: BatchState;
}

export interface Ingredient {
  id: number;
  productId: number;
  name: string;
  needed: number;
  /** Odoo's word for it: "assigned" means set aside, "confirmed" means short. */
  state: string;
}

export interface RecipeLine {
  productId: number;
  name: string;
  qty: number;
}

export interface Recipe {
  id: number;
  productId: number;
  name: string;
  /** How many the recipe makes, as written in Odoo (for example 48 cookies). */
  makes: number;
  unit: string;
  lines: RecipeLine[];
}

export interface Shortage {
  name: string;
  needed: number;
  have: number;
}

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');

/** "Planned", "Started" and so on, in plain words. */
export function stateLabel(s: BatchState | string): string {
  switch (s) {
    case 'draft':
      return 'Planned';
    case 'confirmed':
    case 'progress':
      return 'Started';
    case 'to_close':
      return 'Ready to finish';
    case 'done':
      return 'Finished';
    case 'cancel':
      return 'Cancelled';
    default:
      return s;
  }
}

/** A quantity without trailing zeros: 4, 2.5. */
export const fmtQty = (n: number) => String(Math.round(n * 100) / 100);

const BATCH_FIELDS = ['name', 'product_id', 'product_qty', 'product_uom_id', 'state'];

function toBatch(r: Record<string, unknown>): Batch {
  return { id: r.id as number, name: String(r.name ?? ''), productId: m2oId(r.product_id), product: nameOf(r.product_id), qty: Number(r.product_qty ?? 0), unit: nameOf(r.product_uom_id), state: r.state as BatchState };
}

/** Batches still being made, then the last few finished ones. */
export async function loadBatches(c: Client): Promise<{ open: Batch[]; done: Batch[] }> {
  const open = (await c.call('mrp.production', 'search_read', [[['state', 'in', ['draft', 'confirmed', 'progress', 'to_close']]]], { fields: BATCH_FIELDS, order: 'id desc', limit: 50 })) as Record<string, unknown>[];
  const done = (await c.call('mrp.production', 'search_read', [[['state', '=', 'done']]], { fields: BATCH_FIELDS, order: 'id desc', limit: 10 })) as Record<string, unknown>[];
  return { open: open.map(toBatch), done: done.map(toBatch) };
}

/** The recipes Odoo has (bills of materials that make a product), with their ingredient lines. */
export async function loadRecipes(c: Client): Promise<Recipe[]> {
  const boms = (await c.call('mrp.bom', 'search_read', [[['type', '=', 'normal']]], { fields: ['product_tmpl_id', 'product_id', 'product_qty', 'product_uom_id', 'bom_line_ids'] })) as Record<string, unknown>[];
  if (!boms.length) return [];
  const lineIds = boms.flatMap((b) => (b.bom_line_ids as number[]) ?? []);
  const lines = lineIds.length ? ((await c.call('mrp.bom.line', 'read', [lineIds], { fields: ['bom_id', 'product_id', 'product_qty'] })) as Record<string, unknown>[]) : [];
  const tmplIds = boms.filter((b) => !m2oId(b.product_id)).map((b) => m2oId(b.product_tmpl_id));
  const variants = tmplIds.length ? ((await c.call('product.product', 'search_read', [[['product_tmpl_id', 'in', tmplIds]]], { fields: ['product_tmpl_id'] })) as Record<string, unknown>[]) : [];
  const out: Recipe[] = [];
  for (const b of boms) {
    const productId = m2oId(b.product_id) || (variants.find((v) => m2oId(v.product_tmpl_id) === m2oId(b.product_tmpl_id))?.id as number | undefined) || 0;
    if (!productId) continue;
    out.push({
      id: b.id as number,
      productId,
      name: nameOf(b.product_id) || nameOf(b.product_tmpl_id),
      makes: Number(b.product_qty ?? 1) || 1,
      unit: nameOf(b.product_uom_id),
      lines: lines.filter((l) => m2oId(l.bom_id) === b.id).map((l) => ({ productId: m2oId(l.product_id), name: nameOf(l.product_id), qty: Number(l.product_qty ?? 0) })),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Free stock for each product, as Odoo counts it. */
export async function loadFreeStock(c: Client, productIds: number[]): Promise<Record<number, number>> {
  if (!productIds.length) return {};
  const rows = (await c.call('product.product', 'read', [productIds], { fields: ['free_qty'] })) as { id: number; free_qty?: number }[];
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.free_qty ?? 0)]));
}

/** What a batch of this size needs, scaled from the recipe. */
export function needed(recipe: Recipe, qty: number): RecipeLine[] {
  const scale = qty / recipe.makes;
  return recipe.lines.map((l) => ({ ...l, qty: Math.round(l.qty * scale * 1000) / 1000 }));
}

/** Ingredients the shelves don't have enough of. Empty when all is there. */
export function shortages(recipe: Recipe, qty: number, free: Record<number, number>): Shortage[] {
  return needed(recipe, qty)
    .filter((l) => (free[l.productId] ?? 0) < l.qty)
    .map((l) => ({ name: l.name, needed: l.qty, have: Math.max(0, free[l.productId] ?? 0) }));
}

/**
 * The change that starts a batch: makes the manufacturing order in Odoo and
 * confirms it, so Odoo sets ingredients aside. A short token in `origin` lets a
 * retry find the batch if the first send got there but the answer was lost.
 */
export function startBatchChange(recipe: Recipe, qty: number, now = Date.now()): NewChange {
  const token = `food-app-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Start batch: ${fmtQty(qty)} ${recipe.name}`,
    model: 'mrp.production',
    method: 'create',
    args: [{ product_id: recipe.productId, product_qty: qty, bom_id: recipe.id, origin: token }],
    already: { model: 'mrp.production', domain: [['origin', '=', token]] },
    then: { method: 'action_confirm', onlyWhen: [['state', '=', 'draft']] },
  };
}

export interface BatchDetail extends Batch {
  ingredients: Ingredient[];
  /** The batch numbers already on it (finished batches). */
  lots: { id: number; name: string; useBy: string }[];
  /** True when Odoo can take a batch number on a batch. */
  canRecordLot: boolean;
}

export async function loadBatchDetail(c: Client, id: number): Promise<BatchDetail | null> {
  const fields = (await c.call('mrp.production', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  const hasLots = 'lot_producing_ids' in fields;
  const [r] = (await c.call('mrp.production', 'read', [[id]], { fields: [...BATCH_FIELDS, 'move_raw_ids', ...(hasLots ? ['lot_producing_ids'] : [])] })) as Record<string, unknown>[];
  if (!r) return null;
  const moveIds = (r.move_raw_ids as number[]) ?? [];
  const moves = moveIds.length ? ((await c.call('stock.move', 'read', [moveIds], { fields: ['product_id', 'product_uom_qty', 'state'] })) as Record<string, unknown>[]) : [];
  const lotIds = hasLots ? ((r.lot_producing_ids as number[]) ?? []) : [];
  const lots = lotIds.length ? ((await c.call('stock.lot', 'read', [lotIds], { fields: ['name', 'expiration_date'] })) as Record<string, unknown>[]) : [];
  return {
    ...toBatch(r),
    ingredients: moves.map((m) => ({ id: m.id as number, productId: m2oId(m.product_id), name: nameOf(m.product_id), needed: Number(m.product_uom_qty ?? 0), state: String(m.state ?? '') })),
    lots: lots.map((l) => ({ id: l.id as number, name: String(l.name), useBy: typeof l.expiration_date === 'string' ? l.expiration_date.slice(0, 10) : '' })),
    canRecordLot: hasLots,
  };
}

/** Ingredient lines Odoo says are short (started batches only; a planned batch hasn't set anything aside yet). */
export const shortIngredients = (d: BatchDetail) => (d.state === 'draft' ? [] : d.ingredients.filter((i) => i.state !== 'assigned' && i.state !== 'done' && i.state !== 'cancel'));

/** "2026-11-25" in the phone's own calendar. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today plus a number of days, as "YYYY-MM-DD". */
export function addDays(from: Date, days: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return ymd(d);
}

/** A first guess at the batch number, from the date and the batch's name. The person can change it. */
export function suggestBatchNumber(batchName: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const tail = batchName.match(/(\d+)\s*$/)?.[1] ?? '';
  return `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}${tail ? `-${tail.replace(/^0+(?=\d)/, '')}` : ''}`;
}

/**
 * The product's shelf life in days, as set in Odoo (Inventory tab, "Expiration
 * Time"). Null when Odoo has none, so the person types the date.
 */
export async function shelfLifeDays(c: Client, productId: number): Promise<number | null> {
  try {
    const fields = (await c.call('product.product', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
    if (!('expiration_time' in fields)) return null;
    const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['expiration_time'] })) as { expiration_time?: number }[];
    const n = Number(p?.expiration_time ?? 0);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** True for "YYYY-MM-DD" that is a real date. */
export function isDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Looks for a batch number that already exists for this product, so the same one isn't made twice. */
export async function findLot(c: Client, productId: number, name: string): Promise<number | null> {
  const ids = (await c.call('stock.lot', 'search', [[['product_id', '=', productId], ['name', '=', name]]])) as number[];
  return ids[0] ?? null;
}

/**
 * The changes that finish a batch, in order: record how many were made and the
 * batch number with its use-by date, then mark the batch done. Both skip
 * themselves if the batch is already finished in Odoo. `existingLotId` is
 * given when that batch number is already in Odoo for this product.
 */
export function finishBatchChanges(batch: Pick<Batch, 'id' | 'name' | 'productId' | 'qty'>, lotName: string, useBy: string, madeQty = batch.qty, existingLotId: number | null = null): NewChange[] {
  const already = { model: 'mrp.production', domain: [['id', '=', batch.id], ['state', '=', 'done']] };
  const lot = existingLotId ? [[4, existingLotId, 0]] : [[0, 0, { name: lotName.trim(), product_id: batch.productId, expiration_date: `${useBy} 12:00:00` }]];
  return [
    { label: `Batch number ${lotName.trim()} on ${batch.name}`, model: 'mrp.production', method: 'write', args: [[batch.id], { qty_producing: madeQty, lot_producing_ids: lot }], already },
    { label: `Finish batch ${batch.name}`, model: 'mrp.production', method: 'button_mark_done', args: [[batch.id]], kwargs: { context: { skip_consumption: true, skip_backorder: true } }, already },
  ];
}
