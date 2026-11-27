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
  /** The full name, with the variant (size, jar) when it has one. */
  name: string;
  /** Set when asked for: this product already has a recipe. */
  hasRecipe?: boolean;
}

/**
 * Products matching what was typed, from Odoo, by their full name (Odoo's
 * display name includes the variant). With `markRecipes`, each says whether it
 * already has a recipe, and those come first. With `rawOnly`, only raw materials,
 * counted or not (a new ingredient may not be tracked yet).
 */
export async function searchProducts(c: Client, text: string, markRecipes = false, rawOnly = false): Promise<ProductRow[]> {
  const domain: unknown[] = text.trim() ? [['name', 'ilike', text.trim()]] : [];
  const fields = (await c.call('product.product', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  if (rawOnly) {
    // Ingredients: the Raw Material category (and what is under it); with no such category, what Odoo can buy.
    const cats = (await c.call('product.category', 'search', [[['name', 'ilike', 'raw material']]], {})) as number[];
    if (cats.length) domain.push(['categ_id', 'child_of', cats]);
    else if ('purchase_ok' in fields) domain.push(['purchase_ok', '=', true]);
  } else if ('is_storable' in fields) domain.push(['is_storable', '=', true]);
  const rows = (await c.call('product.product', 'search_read', [domain], { fields: ['display_name', 'name', 'product_tmpl_id'], order: 'name asc, id asc', limit: 40 })) as Record<string, unknown>[];
  const out: ProductRow[] = rows.map((r) => ({ id: r.id as number, name: String(r.display_name || r.name) }));
  if (!markRecipes || !rows.length) return out;
  const tmpl = (r: Record<string, unknown>) => (Array.isArray(r.product_tmpl_id) ? (r.product_tmpl_id[0] as number) : 0);
  const boms = (await c.call('mrp.bom', 'search_read', [[['product_tmpl_id', 'in', rows.map(tmpl)]]], { fields: ['product_tmpl_id', 'product_id'] })) as Record<string, unknown>[];
  const withRecipe = (r: Record<string, unknown>) =>
    boms.some((b) => (Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[0] : b.product_tmpl_id) === tmpl(r) && (!b.product_id || (Array.isArray(b.product_id) ? b.product_id[0] : b.product_id) === r.id));
  const marked = out.map((o, i) => ({ ...o, hasRecipe: withRecipe(rows[i]!) }));
  return [...marked.filter((m) => m.hasRecipe), ...marked.filter((m) => !m.hasRecipe)];
}

export interface CountLine {
  quantId: number;
  lotId?: number;
  lot: string;
  place: string;
  /** What Odoo says is there. */
  onHand: number;
}

/** What Odoo says is on the shelves for one product, by batch and place. */
export async function loadCountLines(c: Client, productId: number): Promise<CountLine[]> {
  const rows = (await c.call('stock.quant', 'search_read', [[['product_id', '=', productId], ['location_id.usage', '=', 'internal']]], { fields: ['lot_id', 'location_id', 'quantity'] })) as Record<string, unknown>[];
  return rows.map((r) => ({ quantId: r.id as number, lotId: m2oId(r.lot_id), lot: nameOf(r.lot_id), place: nameOf(r.location_id), onHand: Number(r.quantity ?? 0) }));
}

/**
 * The changes for one counted line: put the counted number in, then apply the
 * count so Odoo's stock matches. Applying is skipped if it is already applied.
 */
export function countChange(productName: string, line: CountLine, counted: number): NewChange {
  return {
    label: `Count ${productName}${line.lot ? ` batch ${line.lot}` : ''}: ${counted}`,
    model: 'stock.quant',
    method: 'count',
    args: [],
    step: { kind: 'count', quantId: line.quantId, counted, expected: line.onHand },
  };
}

/**
 * Applies a count, unless stock moved since the person looked: a count made
 * with no signal is applied later, and stock may have been sold or used in
 * between. Then it stops with a plain reason and the person counts again.
 */
export async function runCount(c: Client, s: { quantId: number; counted: number; expected: number }): Promise<void> {
  const [q] = (await c.call('stock.quant', 'read', [[s.quantId]], { fields: ['quantity'] })) as { quantity?: number }[];
  if (!q) throw new Error('That stock line is no longer in Odoo. Count it again.');
  if (Math.abs(Number(q.quantity ?? 0) - s.expected) > 1e-9 && Math.abs(Number(q.quantity ?? 0) - s.counted) > 1e-9)
    throw new Error(`Stock changed since you counted: you saw ${s.expected}, Odoo now has ${Number(q.quantity ?? 0)}. Count it again.`);
  await c.call('stock.quant', 'write', [[s.quantId], { inventory_quantity: s.counted, inventory_quantity_set: true }], {});
  const todo = (await c.call('stock.quant', 'search', [[['id', '=', s.quantId], ['inventory_quantity_set', '=', true]]])) as number[];
  if (todo.length) await c.call('stock.quant', 'action_apply_inventory', [todo], {});
}

export interface WasteReason {
  id: number;
  name: string;
}

/** The reasons Odoo has for scrapping stock. Empty if this Odoo has none to read. */
export async function loadWasteReasons(c: Client): Promise<WasteReason[]> {
  try {
    const rows = (await c.call('stock.scrap.reason.tag', 'search_read', [[]], { fields: ['name'], order: 'sequence asc, id asc', limit: 30 })) as { id: number; name: string }[];
    return rows.map((r) => ({ id: r.id, name: String(r.name) }));
  } catch {
    return [];
  }
}

/** Waste or spoilage: some of a product (and batch) taken off the stock, with a reason. */
export function wasteChange(productName: string, productId: number, lotId: number, qty: number, reasonIds: number[], now = Date.now()): NewChange {
  const token = `food-app-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Waste: ${qty} ${productName}`,
    model: 'stock.scrap',
    method: 'create',
    args: [{ product_id: productId, ...(lotId ? { lot_id: lotId } : {}), scrap_qty: qty, origin: token, ...(reasonIds.length ? { scrap_reason_tag_ids: [[6, 0, reasonIds]] } : {}) }],
    already: { model: 'stock.scrap', domain: [['origin', '=', token]] },
    then: { method: 'action_validate', onlyWhen: [['state', '=', 'draft']] },
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
  usedIn: { id: number; name: string; product: string }[];
  /** Customer deliveries it went out on. */
  wentOutOn: { name: string; origin: string; customer: string; qty: number }[];
}

/** Batches whose number contains what was typed. With nothing typed, the newest batches. */
export async function findLots(c: Client, text: string): Promise<{ id: number; name: string; product: string }[]> {
  const t = text.trim();
  const rows = (await c.call('stock.lot', 'search_read', [t ? [['name', 'ilike', t]] : []], { fields: ['name', 'product_id'], order: 'id desc', limit: t ? 20 : 12 })) as Record<string, unknown>[];
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
    usedIn: used.map((m) => ({ id: m.id as number, name: String(m.name), product: nameOf(m.product_id) })),
    wentOutOn,
  };
}

export type StockKind = 'all' | 'made' | 'raw';

export interface InStockRow {
  id: number;
  name: string;
  onHand: number;
  /** What is free after orders, as Odoo counts it. */
  free: number;
  unit: string;
}

/** What is on the shelves: every counted product with how much there is, in Odoo's own unit. */
export async function loadInStock(c: Client, text: string, kind: StockKind): Promise<InStockRow[]> {
  const domain: unknown[] = text.trim() ? [['name', 'ilike', text.trim()]] : [];
  const fields = (await c.call('product.product', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  if ('is_storable' in fields) domain.push(['is_storable', '=', true]);
  if (kind !== 'all') {
    const roots = (await c.call('product.category', 'search', [[['name', 'ilike', 'raw material']]], {})) as number[];
    if (roots.length) {
      const all = (await c.call('product.category', 'search', [[['id', 'child_of', roots]]], {})) as number[];
      domain.push(['categ_id', kind === 'raw' ? 'in' : 'not in', all]);
    }
  }
  const rows = (await c.call('product.product', 'search_read', [domain], { fields: ['display_name', 'name', 'qty_available', 'free_qty', 'uom_id'], order: 'name asc, id asc', limit: 80 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.display_name || r.name), onHand: Number(r.qty_available ?? 0), free: Number(r.free_qty ?? 0), unit: Array.isArray(r.uom_id) ? String(r.uom_id[1]) : '' }));
}

export interface JarRow extends InStockRow {
  /** Days to the soonest use-by of this jar, when it is within the alert window. */
  soon?: number;
}

export interface JarGroup {
  key: string;
  name: string;
  total: number;
  /** Soonest use-by (days) of any size. */
  soon?: number;
  sizes: { id: number; size: string; onHand: number }[];
}

/** "Black Raspberry Jelly (4 oz)" is the product "Black Raspberry Jelly" in the size "4 oz". */
export function splitSize(name: string): { base: string; size: string } {
  const m = name.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m && m[1] ? { base: m[1], size: m[2] ?? '' } : { base: name, size: '' };
}

/**
 * The jars list for the Make tab: sizes grouped under their product, ingredients
 * left out, out-of-stock hidden unless asked for, and ordered use-by soon first,
 * then the most in stock, then the rest A to Z.
 */
export function groupJars(rows: JarRow[], opts: { ingredientIds?: Set<number>; showEmpty?: boolean; text?: string } = {}): JarGroup[] {
  const map = new Map<string, JarGroup>();
  const q = (opts.text ?? '').trim().toLowerCase();
  for (const r of rows) {
    if (opts.ingredientIds?.has(r.id)) continue;
    const { base, size } = splitSize(r.name);
    if (q && !r.name.toLowerCase().includes(q)) continue;
    const g = map.get(base) ?? { key: base, name: base, total: 0, sizes: [] };
    g.total += r.onHand;
    if (r.soon !== undefined && (g.soon === undefined || r.soon < g.soon)) g.soon = r.soon;
    g.sizes.push({ id: r.id, size, onHand: r.onHand });
    map.set(base, g);
  }
  return [...map.values()]
    .filter((g) => opts.showEmpty || g.total > 0)
    .sort((a, b) => (a.soon === undefined ? 1 : 0) - (b.soon === undefined ? 1 : 0) || (a.soon ?? 0) - (b.soon ?? 0) || (b.total > 0 ? 1 : 0) - (a.total > 0 ? 1 : 0) || b.total - a.total || a.name.localeCompare(b.name));
}
