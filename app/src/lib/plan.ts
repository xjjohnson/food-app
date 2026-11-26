/**
 * Planning and shopping: the batches planned for the next days, what they
 * need, what is on hand and on order, and what to buy. A planned batch is a
 * draft manufacturing order in Odoo (the source of truth, no phone-only
 * plans). The app only adds up the recipe amounts; stock, incoming and the
 * unit come from Odoo. No prices or costs are worked out here.
 *
 * Kept free of React; the client is passed in.
 */
import { loadRules, usualSuppliers } from './ingredients';
import { m2oId, type OdooClient } from './odoo';
import { needed, Recipe } from './production';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface PlanLine {
  recipe: Recipe;
  qty: number;
}

export interface Need {
  productId: number;
  name: string;
  unit: string;
  needed: number;
}

export interface NeedRow extends Need {
  have: number;
  onOrder: number;
  /** What still has to be bought: needed minus on hand minus on order, never below 0. */
  short: number;
  /** Jars, lids, labels and other packaging, by product category. */
  packaging: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The recipe amounts of all planned batches added together, by ingredient. */
export function planNeeds(plan: PlanLine[]): Need[] {
  const by = new Map<number, Need>();
  for (const p of plan) {
    for (const l of needed(p.recipe, p.qty)) {
      const cur = by.get(l.productId);
      if (cur) cur.needed = r3(cur.needed + l.qty);
      else by.set(l.productId, { productId: l.productId, name: l.name, unit: l.unit ?? '', needed: l.qty });
    }
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** On hand (free) and on order (incoming) for each product, as Odoo counts them, plus the category name. */
export async function loadNeedRows(c: Client, needs: Need[]): Promise<NeedRow[]> {
  if (!needs.length) return [];
  const rows = (await c.call('product.product', 'read', [needs.map((n) => n.productId)], { fields: ['free_qty', 'incoming_qty', 'categ_id'] })) as Record<string, unknown>[];
  return needs.map((n) => {
    const p = rows.find((r) => r.id === n.productId) ?? {};
    const have = Math.max(0, Number(p.free_qty ?? 0));
    const onOrder = Math.max(0, Number(p.incoming_qty ?? 0));
    const cat = Array.isArray(p.categ_id) ? String(p.categ_id[1] ?? '') : '';
    return { ...n, have, onOrder, short: Math.max(0, r3(n.needed - have - onOrder)), packaging: /packag|jar|lid|label/i.test(cat) };
  });
}

/** Saves one planned batch: a draft manufacturing order, not confirmed, so nothing is set aside yet. */
export function planBatchChange(recipe: Recipe, qty: number, now = Date.now()): NewChange {
  const token = `food-app-plan-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Plan batch: ${qty} ${recipe.name}`,
    model: 'mrp.production',
    method: 'create',
    args: [{ product_id: recipe.productId, product_qty: qty, bom_id: recipe.id, origin: token }],
    already: { model: 'mrp.production', domain: [['origin', '=', token]] },
  };
}

/** Draft batches already planned in Odoo, matched to their recipe. */
export async function loadPlanned(c: Client, recipes: Recipe[]): Promise<PlanLine[]> {
  const rows = (await c.call('mrp.production', 'search_read', [[['state', '=', 'draft']]], { fields: ['bom_id', 'product_qty'], limit: 60 })) as Record<string, unknown>[];
  return rows.flatMap((r) => {
    const recipe = recipes.find((x) => x.id === m2oId(r.bom_id));
    return recipe ? [{ recipe, qty: Number(r.product_qty ?? 0) }] : [];
  });
}

export interface ShopRow {
  productId: number;
  name: string;
  unit: string;
  /** How much to buy. */
  buy: number;
  why: string;
  supplier: string;
}

/**
 * The shopping list: what planned batches are short of, plus what is running
 * low, grouped by the product's usual supplier (the first on its Odoo vendor
 * list). Check-offs are kept on the phone only.
 */
export async function loadShoppingList(c: Client, planned: NeedRow[]): Promise<ShopRow[]> {
  const out = new Map<number, ShopRow>();
  for (const r of planned.filter((x) => x.short > 0)) out.set(r.productId, { productId: r.productId, name: r.name, unit: r.unit, buy: r.short, why: 'Needed for planned batches', supplier: '' });
  try {
    for (const l of await loadRules(c, true)) {
      const cur = out.get(l.productId);
      if (cur) cur.why = 'Planned batches and running low';
      else out.set(l.productId, { productId: l.productId, name: l.name, unit: l.unit, buy: Math.round(l.suggest * 100) / 100, why: 'Running low', supplier: '' });
    }
  } catch {
    // No reorder rules readable: the plan alone makes the list.
  }
  for (const row of out.values()) {
    try {
      row.supplier = (await usualSuppliers(c, row.productId))[0]?.name ?? '';
    } catch {
      // No vendor list readable: left under "No usual supplier".
    }
  }
  return [...out.values()].sort((a, b) => (a.supplier || '~').localeCompare(b.supplier || '~') || a.name.localeCompare(b.name));
}

export interface PriceCost {
  price: number;
  cost: number;
}

/** Odoo's own sale price and cost of a product, side by side. The app works out no margin. */
export async function loadPriceCost(c: Client, productId: number): Promise<PriceCost | null> {
  try {
    const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['list_price', 'standard_price'] })) as { list_price?: number; standard_price?: number }[];
    return p ? { price: Number(p.list_price ?? 0), cost: Number(p.standard_price ?? 0) } : null;
  } catch {
    return null;
  }
}
