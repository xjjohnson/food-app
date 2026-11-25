/**
 * A recipe the way Odoo holds it (a bill of materials): the product and its
 * variant, how many it makes and in which unit, a reference, whether it is
 * made or a kit, the components (each with its amount and unit, in order) and
 * the by-products.
 *
 * The recipe screen edits a local draft and saves it once. `recipeChanges`
 * works out what differs from what Odoo had and returns the changes for the
 * offline queue, in an order that is safe to send (removals, then edits, then
 * additions). The app never works out prices or costs.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const num = (v: unknown) => Number(v ?? 0) || 0;
const token = (now: number) => `food-app-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export type BomType = 'normal' | 'phantom';

export interface Unit {
  id: number;
  name: string;
}

/** A component or a by-product line. `id` is null for one not in Odoo yet. */
export interface RecipeLine {
  key: string;
  id: number | null;
  productId: number;
  name: string;
  qty: string;
  unitId: number;
  unit: string;
  /** By-products only: the share of the cost they take, in percent. */
  costShare?: string;
}

export interface Recipe {
  id: number | null;
  /** The product (template) and the variant, if the recipe is for one variant. */
  templateId: number;
  templateName: string;
  variantId: number;
  variantName: string;
  makes: string;
  unitId: number;
  unit: string;
  code: string;
  type: BomType;
  lines: RecipeLine[];
  byproducts: RecipeLine[];
}

let seq = 0;
export const newKey = () => `n${++seq}`;

export async function loadRecipe(c: Client, bomId: number): Promise<Recipe | null> {
  const [b] = (await c.call('mrp.bom', 'read', [[bomId]], { fields: ['product_tmpl_id', 'product_id', 'product_qty', 'product_uom_id', 'code', 'type', 'bom_line_ids', 'byproduct_ids'] })) as Record<string, unknown>[];
  if (!b) return null;
  const lineIds = (b.bom_line_ids as number[]) ?? [];
  const lines = lineIds.length ? ((await c.call('mrp.bom.line', 'read', [lineIds], { fields: ['product_id', 'product_qty', 'product_uom_id', 'sequence'] })) as Record<string, unknown>[]) : [];
  const byIds = (b.byproduct_ids as number[]) ?? [];
  let by: Record<string, unknown>[] = [];
  if (byIds.length) {
    try {
      by = (await c.call('mrp.bom.byproduct', 'read', [byIds], { fields: ['product_id', 'product_qty', 'product_uom_id', 'cost_share'] })) as Record<string, unknown>[];
    } catch {
      by = [];
    }
  }
  const toLine = (l: Record<string, unknown>, share = false): RecipeLine => ({
    key: `o${l.id}`,
    id: l.id as number,
    productId: m2oId(l.product_id),
    name: nameOf(l.product_id),
    qty: String(num(l.product_qty)),
    unitId: m2oId(l.product_uom_id),
    unit: nameOf(l.product_uom_id),
    ...(share ? { costShare: String(num(l.cost_share)) } : {}),
  });
  return {
    id: bomId,
    templateId: m2oId(b.product_tmpl_id),
    templateName: nameOf(b.product_tmpl_id),
    variantId: m2oId(b.product_id),
    variantName: nameOf(b.product_id),
    makes: String(num(b.product_qty) || 1),
    unitId: m2oId(b.product_uom_id),
    unit: nameOf(b.product_uom_id),
    code: typeof b.code === 'string' ? b.code : '',
    type: b.type === 'phantom' ? 'phantom' : 'normal',
    lines: lines.sort((a, z) => num(a.sequence) - num(z.sequence) || (a.id as number) - (z.id as number)).map((l) => toLine(l)),
    byproducts: by.map((l) => toLine(l, true)),
  };
}

/** The variants a product (template) has, to pick one for a recipe. */
export async function loadVariants(c: Client, templateId: number): Promise<Unit[]> {
  const rows = (await c.call('product.product', 'search_read', [[['product_tmpl_id', '=', templateId]]], { fields: ['display_name'], limit: 50 })) as { id: number; display_name?: string; name?: string }[];
  return rows.map((r) => ({ id: r.id, name: r.display_name ?? r.name ?? '' }));
}

/** A product's own unit of measure, used as the starting unit for a new line. */
export async function productUnit(c: Client, productId: number): Promise<Unit> {
  const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['uom_id'] })) as Record<string, unknown>[];
  return { id: m2oId(p?.uom_id), name: nameOf(p?.uom_id) };
}

/** What a recipe needs to know about a picked product: its template, name and own unit. */
export async function productInfo(c: Client, productId: number): Promise<{ templateId: number; templateName: string; name: string; unit: Unit }> {
  const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['uom_id', 'product_tmpl_id', 'display_name', 'name'] })) as Record<string, unknown>[];
  return { templateId: m2oId(p?.product_tmpl_id), templateName: nameOf(p?.product_tmpl_id), name: String(p?.display_name ?? p?.name ?? ''), unit: { id: m2oId(p?.uom_id), name: nameOf(p?.uom_id) } };
}

export const isPositive = (t: string) => t.trim() !== '' && Number.isFinite(Number(t.replace(',', '.'))) && Number(t.replace(',', '.')) > 0;
const n = (t: string) => Number(t.replace(',', '.'));

/** True when the draft can be saved. */
export function recipeProblems(r: Recipe): string[] {
  const out: string[] = [];
  if (!r.templateId) out.push('Pick what the recipe makes.');
  if (!isPositive(r.makes)) out.push('Type how many it makes.');
  if (!r.unitId) out.push('Pick the unit it makes.');
  if (!r.lines.length) out.push('Add at least one ingredient.');
  for (const l of r.lines) if (!isPositive(l.qty) || !l.unitId) out.push(`Check the amount and unit for ${l.name}.`);
  for (const l of r.byproducts) if (!isPositive(l.qty) || !l.unitId || (l.costShare !== undefined && l.costShare.trim() !== '' && !(Number(l.costShare) >= 0 && Number(l.costShare) <= 100))) out.push(`Check the by-product ${l.name}.`);
  return out;
}

const lineValues = (l: RecipeLine, seq: number, share: boolean) => ({
  product_id: l.productId,
  product_qty: n(l.qty),
  product_uom_id: l.unitId,
  ...(share ? { cost_share: l.costShare && l.costShare.trim() !== '' ? Number(l.costShare) : 0 } : { sequence: seq }),
});

/** A new recipe: one change that makes it with all its lines. */
export function newRecipeChange(r: Recipe, now = Date.now()): NewChange {
  const code = r.code.trim() || token(now);
  return {
    label: `New recipe: ${r.variantName || r.templateName}`,
    model: 'mrp.bom',
    method: 'create',
    args: [
      {
        product_tmpl_id: r.templateId,
        ...(r.variantId ? { product_id: r.variantId } : {}),
        product_qty: n(r.makes),
        product_uom_id: r.unitId,
        code,
        type: r.type,
        bom_line_ids: r.lines.map((l, i) => [0, 0, lineValues(l, (i + 1) * 10, false)]),
        ...(r.byproducts.length ? { byproduct_ids: r.byproducts.map((l) => [0, 0, lineValues(l, 0, true)]) } : {}),
      },
    ],
    already: { model: 'mrp.bom', domain: [['code', '=', code]] },
  };
}

/**
 * What to send to make Odoo's recipe match the draft: header changes, then
 * removed lines, changed lines, and added lines, for components and
 * by-products. Nothing is sent for what did not change.
 */
export function recipeChanges(before: Recipe, draft: Recipe): NewChange[] {
  const id = before.id!;
  const name = draft.variantName || draft.templateName;
  const out: NewChange[] = [];

  const head: Record<string, unknown> = {};
  if (n(draft.makes) !== n(before.makes)) head.product_qty = n(draft.makes);
  if (draft.unitId !== before.unitId) head.product_uom_id = draft.unitId;
  if (draft.code.trim() !== before.code.trim()) head.code = draft.code.trim() || false;
  if (draft.type !== before.type) head.type = draft.type;
  if (draft.variantId !== before.variantId) head.product_id = draft.variantId || false;
  if (Object.keys(head).length) out.push({ label: `Recipe ${name}`, model: 'mrp.bom', method: 'write', args: [[id], head] });

  const group = (model: string, was: RecipeLine[], now: RecipeLine[], share: boolean, word: string) => {
    for (const w of was) if (!now.some((x) => x.id === w.id)) out.push({ label: `${name}: remove ${w.name}`, model, method: 'unlink', args: [[w.id]] });
    // Order: only rewritten when the kept lines moved or a new line went in before one of them.
    const kept = now.filter((l) => l.id !== null).map((l) => l.id);
    const wasKept = was.filter((w) => kept.includes(w.id)).map((w) => w.id);
    const firstNew = now.findIndex((l) => l.id === null);
    const reordered = !share && (kept.some((k, i) => k !== wasKept[i]) || (firstNew !== -1 && now.slice(firstNew).some((l) => l.id !== null)));
    now.forEach((l, i) => {
      if (l.id === null) return;
      const w = was.find((x) => x.id === l.id)!;
      const vals: Record<string, unknown> = {};
      if (n(l.qty) !== n(w.qty)) vals.product_qty = n(l.qty);
      if (l.unitId !== w.unitId) vals.product_uom_id = l.unitId;
      if (share && (l.costShare ?? '') !== (w.costShare ?? '')) vals.cost_share = Number(l.costShare || 0);
      if (reordered) vals.sequence = (i + 1) * 10;
      if (Object.keys(vals).length) out.push({ label: `${name}: ${l.name}`, model, method: 'write', args: [[l.id], vals] });
    });
    now.forEach((l, i) => {
      if (l.id !== null) return;
      out.push({
        label: `${name}: add ${word} ${l.name}`,
        model,
        method: 'create',
        args: [{ bom_id: id, ...lineValues(l, (i + 1) * 10, share) }],
        already: { model, domain: [['bom_id', '=', id], ['product_id', '=', l.productId], ['product_qty', '=', n(l.qty)]] },
      });
    });
  };
  group('mrp.bom.line', before.lines, draft.lines, false, '');
  group('mrp.bom.byproduct', before.byproducts, draft.byproducts, true, 'by-product');
  return out;
}

/** An empty draft for a new recipe. */
export const blankRecipe = (): Recipe => ({ id: null, templateId: 0, templateName: '', variantId: 0, variantName: '', makes: '1', unitId: 0, unit: '', code: '', type: 'normal', lines: [], byproducts: [] });

/** Moves a line up (-1) or down (1). */
export function moveLine(lines: RecipeLine[], index: number, by: -1 | 1): RecipeLine[] {
  const j = index + by;
  if (j < 0 || j >= lines.length) return lines;
  const copy = lines.slice();
  [copy[index], copy[j]] = [copy[j]!, copy[index]!];
  return copy;
}
