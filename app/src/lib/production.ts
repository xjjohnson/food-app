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
  /** The unit Odoo uses on this line, such as "g". */
  unit?: string;
  /** Odoo's word for it: "assigned" means set aside, "confirmed" means short. */
  state: string;
}

export interface RecipeLine {
  productId: number;
  name: string;
  qty: number;
  /** The unit on the recipe line, such as "lb". */
  unit?: string;
  /** Set on a scaled line: the amount the recipe itself has. */
  recipeQty?: number;
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
  unit?: string;
  /** The unit stock is counted in, when it differs from the recipe's. */
  haveUnit?: string;
}

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');

/** The three steps of a batch and where this one is: 0 planned, 1 cooking, 2 finish, 3 all done. */
export const batchStep = (state: string): number => (state === 'draft' ? 0 : state === 'confirmed' || state === 'progress' ? 1 : state === 'to_close' ? 2 : state === 'done' ? 3 : 0);

/** What stops Finish batch, in plain words. Empty when it can go. */
export function finishReasons(a: { canFinish: boolean; loaded: boolean; canRecordLot: boolean; lot: string; okDate: boolean; useBy: string; badAmount: boolean; queued: boolean; state: string }): string[] {
  const out: string[] = [];
  if (!a.canFinish) out.push(a.state === 'draft' ? 'This batch is only planned. Confirm it first.' : a.state === 'done' ? 'This batch is already finished.' : 'This batch is cancelled.');
  if (!a.loaded) out.push('Odoo has not answered yet. Check the signal.');
  else if (!a.canRecordLot) out.push('This Odoo cannot take a batch number on a batch.');
  if (!a.lot.trim()) out.push('Batch number is empty.');
  if (!a.okDate) out.push(a.useBy ? 'Use-by is not a date. Use 2026-12-25.' : 'Use-by date is empty.');
  if (a.badAmount) out.push('An amount used is not a number.');
  if (a.queued) out.push('Saved on the phone, waiting to reach Odoo.');
  return out;
}

/** "Planned", "Cooking" and so on, in plain words. Odoo's own word is shown beside it by `stateWithOdoo`. */
export function stateLabel(s: BatchState | string): string {
  switch (s) {
    case 'draft':
      return 'Planned';
    case 'confirmed':
      return 'Ready to cook';
    case 'progress':
      return 'Cooking';
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

const ODOO_WORDS: Record<string, string> = { draft: 'Draft', confirmed: 'Confirmed', progress: 'In Progress', to_close: 'To Close', done: 'Done', cancel: 'Cancelled' };

/** "Planned (Odoo: Confirmed)": our word first, Odoo's word in small print beside it. */
export const stateWithOdoo = (s: BatchState | string): string => `${stateLabel(s)} (Odoo: ${ODOO_WORDS[s] ?? s})`;

/** A quantity without trailing zeros: 4, 2.5. */
export const fmtQty = (n: number) => String(Math.round(n * 100) / 100);

/**
 * "20 packs of 6", "1 unit", "12 Jars": a count with its unit in plain words.
 * Odoo's unit names are plural ("Units") or a pack name ("Pack of 6").
 */
export function qtyWords(n: number, unit?: string): string {
  const u = (unit ?? '').trim();
  const count = fmtQty(n);
  if (!u) return count;
  const pack = /^pack of (\d+)$/i.exec(u);
  if (pack) return `${count} ${n === 1 ? 'pack' : 'packs'} of ${pack[1]}`;
  if (/^units?$/i.test(u)) return `${count} ${n === 1 ? 'unit' : 'units'}`;
  return `${count} ${u}`;
}

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
  const lines = lineIds.length ? ((await c.call('mrp.bom.line', 'read', [lineIds], { fields: ['bom_id', 'product_id', 'product_qty', 'product_uom_id', 'sequence'] })) as Record<string, unknown>[]) : [];
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
      lines: lines
        .filter((l) => m2oId(l.bom_id) === b.id)
        .sort((a, z) => Number(a.sequence ?? 0) - Number(z.sequence ?? 0) || (a.id as number) - (z.id as number))
        .map((l) => ({ productId: m2oId(l.product_id), name: nameOf(l.product_id), qty: Number(l.product_qty ?? 0), unit: nameOf(l.product_uom_id) || undefined })),
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

/** The unit each product's stock is counted in (its own unit in Odoo). */
export async function loadStockUnits(c: Client, productIds: number[]): Promise<Record<number, string>> {
  if (!productIds.length) return {};
  const rows = (await c.call('product.product', 'read', [productIds], { fields: ['uom_id'] })) as { id: number; uom_id?: unknown }[];
  return Object.fromEntries(rows.map((r) => [r.id, nameOf(r.uom_id)]));
}

/** What a batch of this size needs, scaled from the recipe. */
export function needed(recipe: Recipe, qty: number): RecipeLine[] {
  const scale = qty / recipe.makes;
  return recipe.lines.map((l) => ({ ...l, recipeQty: l.qty, qty: Math.round(l.qty * scale * 1000) / 1000 }));
}

/** Ingredients the shelves don't have enough of. Empty when all is there. */
export function shortages(recipe: Recipe, qty: number, free: Record<number, number>, stockUnits: Record<number, string> = {}): Shortage[] {
  return needed(recipe, qty)
    .filter((l) => (free[l.productId] ?? 0) < l.qty)
    .map((l) => ({ name: l.name, needed: l.qty, have: Math.max(0, free[l.productId] ?? 0), unit: l.unit, ...(stockUnits[l.productId] && l.unit && stockUnits[l.productId] !== l.unit ? { haveUnit: stockUnits[l.productId] } : {}) }));
}

/** Names of the ingredients there is enough of. */
export function enough(recipe: Recipe, qty: number, free: Record<number, number>): string[] {
  return needed(recipe, qty)
    .filter((l) => (free[l.productId] ?? 0) >= l.qty)
    .map((l) => l.name);
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
  const moves = moveIds.length ? ((await c.call('stock.move', 'read', [moveIds], { fields: ['product_id', 'product_uom_qty', 'product_uom', 'state'] })) as Record<string, unknown>[]) : [];
  const lotIds = hasLots ? ((r.lot_producing_ids as number[]) ?? []) : [];
  const lots = lotIds.length ? ((await c.call('stock.lot', 'read', [lotIds], { fields: ['name', 'expiration_date'] })) as Record<string, unknown>[]) : [];
  return {
    ...toBatch(r),
    ingredients: moves.map((m) => ({ id: m.id as number, productId: m2oId(m.product_id), name: nameOf(m.product_id), needed: Number(m.product_uom_qty ?? 0), unit: nameOf(m.product_uom), state: String(m.state ?? '') })),
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

/** Today plus a number of months, as "YYYY-MM-DD" (the 31st stays inside shorter months). */
export function addMonths(from: Date, months: number): string {
  const day = from.getDate();
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return ymd(d);
}

export type UseBySource = 'product' | 'default' | 'fallback';

/**
 * The use-by date to start from: the product's shelf life in Odoo, else the
 * app's default shelf life (set by the owner), else six months. The person can
 * change it.
 */
export function useByStart(productDays: number | null, defaultDays: number | null, today = new Date()): { date: string; source: UseBySource; days: number | null } {
  if (productDays && productDays > 0) return { date: addDays(today, productDays), source: 'product', days: productDays };
  if (defaultDays && defaultDays > 0) return { date: addDays(today, defaultDays), source: 'default', days: defaultDays };
  return { date: addMonths(today, 6), source: 'fallback', days: null };
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

export interface UsedAmount {
  moveId: number;
  name: string;
  planned: number;
  actual: number;
}

export interface BatchCost {
  total: number;
  perUnit: number;
  made: number;
}

/**
 * What Odoo worked out the finished batch cost, read from the finished product's
 * stock move. The app never works the cost out itself. Null when Odoo has no
 * figure (or this Odoo has no such field).
 */
export async function loadBatchCost(c: Client, id: number): Promise<BatchCost | null> {
  try {
    const mf = (await c.call('stock.move', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
    if (!('value' in mf)) return null;
    const [mo] = (await c.call('mrp.production', 'read', [[id]], { fields: ['move_finished_ids'] })) as { move_finished_ids?: number[] }[];
    const ids = mo?.move_finished_ids ?? [];
    if (!ids.length) return null;
    const moves = (await c.call('stock.move', 'read', [ids], { fields: ['value', 'quantity', 'state'] })) as { value?: number; quantity?: number; state?: string }[];
    const done = moves.filter((m) => m.state === 'done');
    const total = done.reduce((a, m) => a + Number(m.value ?? 0), 0);
    const made = done.reduce((a, m) => a + Number(m.quantity ?? 0), 0);
    if (!(total > 0) || !(made > 0)) return null;
    return { total, perUnit: total / made, made };
  } catch {
    return null;
  }
}

/**
 * The changes that finish a batch, in order: record how many were made and the
 * batch number with its use-by date, then mark the batch done. Both skip
 * themselves if the batch is already finished in Odoo. `existingLotId` is
 * given when that batch number is already in Odoo for this product.
 */
export function finishBatchChanges(batch: Pick<Batch, 'id' | 'name' | 'productId' | 'qty'>, lotName: string, useBy: string, madeQty = batch.qty, existingLotId: number | null = null, used: UsedAmount[] = []): NewChange[] {
  const already = { model: 'mrp.production', domain: [['id', '=', batch.id], ['state', '=', 'done']] };
  const lot = existingLotId ? [[4, existingLotId, 0]] : [[0, 0, { name: lotName.trim(), product_id: batch.productId, expiration_date: `${useBy} 12:00:00` }]];
  // Only amounts that differ from the plan are written; Odoo uses the planned amount for the rest.
  const amounts: NewChange[] = used
    .filter((u) => u.actual !== u.planned)
    .map((u) => ({ label: `Used ${fmtQty(u.actual)} ${u.name} on ${batch.name}`, model: 'stock.move', method: 'write', args: [[u.moveId], { quantity: u.actual, picked: true }], already }));
  return [
    ...amounts,
    { label: `Batch number ${lotName.trim()} on ${batch.name}`, model: 'mrp.production', method: 'write', args: [[batch.id], { qty_producing: madeQty, lot_producing_ids: lot }], already },
    { label: `Finish batch ${batch.name}`, model: 'mrp.production', method: 'button_mark_done', args: [[batch.id]], kwargs: { context: { skip_consumption: true, skip_backorder: true } }, already },
  ];
}
