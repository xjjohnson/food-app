/**
 * The ingredient list: see, add and change ingredients (products Odoo can
 * buy), with their unit, cost, purchase taxes and vendor price lines.
 *
 * Everything shown comes from Odoo, and every change is a change for the
 * offline queue. What a person types for a cost or a vendor price is saved as
 * typed; the app never works out a price or a tax. A tax is only picked from
 * the ones Odoo has. The app never switches "Track Inventory" on: it shows
 * whether a product has it, and says to turn it on in Odoo.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export interface Named {
  id: number;
  name: string;
}

export interface IngredientRow {
  id: number;
  name: string;
  category: string;
  unit: string;
  onHand: number;
  cost: number;
  variants: number;
}

export const loadCategories = async (c: Client): Promise<Named[]> =>
  ((await c.call('product.category', 'search_read', [[]], { fields: ['complete_name'], order: 'complete_name asc', limit: 100 })) as { id: number; complete_name?: string; name?: string }[]).map((r) => ({ id: r.id, name: r.complete_name ?? r.name ?? '' }));

export const loadUnits = async (c: Client): Promise<Named[]> =>
  ((await c.call('uom.uom', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 100 })) as { id: number; name: string }[]).map((r) => ({ id: r.id, name: r.name }));

export const loadPurchaseTaxes = async (c: Client): Promise<Named[]> => {
  try {
    return ((await c.call('account.tax', 'search_read', [[['type_tax_use', '=', 'purchase']]], { fields: ['name'], order: 'name asc', limit: 50 })) as { id: number; name: string }[]).map((r) => ({ id: r.id, name: r.name }));
  } catch {
    return [];
  }
};

/** Ingredients: products Odoo can buy, in a category (or all), by name. */
export async function loadIngredients(c: Client, categoryId: number | null, text: string): Promise<IngredientRow[]> {
  const domain: unknown[] = [['purchase_ok', '=', true]];
  if (categoryId) domain.push(['categ_id', 'child_of', categoryId]);
  if (text.trim()) domain.push(['name', 'ilike', text.trim()]);
  const rows = (await c.call('product.template', 'search_read', [domain], { fields: ['name', 'categ_id', 'uom_id', 'qty_available', 'standard_price', 'product_variant_count'], order: 'name asc', limit: 100 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), category: nameOf(r.categ_id), unit: nameOf(r.uom_id), onHand: num(r.qty_available), cost: num(r.standard_price), variants: num(r.product_variant_count) }));
}

export interface VendorLine {
  id: number;
  partnerId: number;
  vendor: string;
  price: number;
  minQty: number;
  days: number;
}

export interface Ingredient extends IngredientRow {
  categoryId: number;
  taxIds: number[];
  reference: string;
  barcode: string;
  /** True when Odoo counts stock for it ("Track Inventory"). */
  tracked: boolean;
  vendors: VendorLine[];
}

export async function loadIngredient(c: Client, id: number): Promise<Ingredient | null> {
  const [r] = (await c.call('product.template', 'read', [[id]], { fields: ['name', 'categ_id', 'uom_id', 'qty_available', 'standard_price', 'product_variant_count', 'supplier_taxes_id', 'default_code', 'barcode', 'is_storable', 'seller_ids'] })) as Record<string, unknown>[];
  if (!r) return null;
  const sellerIds = (r.seller_ids as number[]) ?? [];
  const sellers = sellerIds.length ? ((await c.call('product.supplierinfo', 'read', [sellerIds], { fields: ['partner_id', 'price', 'min_qty', 'delay'] })) as Record<string, unknown>[]) : [];
  return {
    id,
    name: String(r.name),
    category: nameOf(r.categ_id),
    categoryId: m2oId(r.categ_id),
    unit: nameOf(r.uom_id),
    onHand: num(r.qty_available),
    cost: num(r.standard_price),
    variants: num(r.product_variant_count),
    taxIds: ((r.supplier_taxes_id as number[]) ?? []).slice(),
    reference: str(r.default_code),
    barcode: str(r.barcode),
    tracked: r.is_storable === true,
    vendors: sellers.map((s) => ({ id: s.id as number, partnerId: m2oId(s.partner_id), vendor: nameOf(s.partner_id), price: num(s.price), minQty: num(s.min_qty), days: num(s.delay) })),
  };
}

export interface IngredientValues {
  name: string;
  categoryId: number | null;
  cost: number;
  taxIds: number[];
  reference: string;
  barcode: string;
  /** True when Odoo works the cost out itself (Average Cost): the cost is then not written. */
  costLocked?: boolean;
}

export function editIngredientChange(id: number, v: IngredientValues): NewChange {
  return {
    label: `Ingredient ${v.name.trim()}`,
    model: 'product.template',
    method: 'write',
    args: [[id], { name: v.name.trim(), ...(v.costLocked ? {} : { standard_price: v.cost }), supplier_taxes_id: [[6, 0, v.taxIds]], default_code: v.reference.trim() || false, barcode: v.barcode.trim() || false, ...(v.categoryId ? { categ_id: v.categoryId } : {}) }],
  };
}

/** A new ingredient: buyable, not for sale. Made without "Track Inventory"; the owner turns that on in Odoo. */
export function newIngredientChange(v: IngredientValues, unitId: number | null): NewChange {
  return {
    label: `New ingredient: ${v.name.trim()}`,
    model: 'product.template',
    method: 'create',
    args: [{ name: v.name.trim(), purchase_ok: true, sale_ok: false, is_storable: true, standard_price: v.cost, supplier_taxes_id: [[6, 0, v.taxIds]], ...(v.reference.trim() ? { default_code: v.reference.trim() } : {}), ...(v.barcode.trim() ? { barcode: v.barcode.trim() } : {}), ...(v.categoryId ? { categ_id: v.categoryId } : {}), ...(unitId ? { uom_id: unitId } : {}) }],
    already: { model: 'product.template', domain: [['name', '=', v.name.trim()]] },
  };
}

export interface VendorValues {
  partnerId: number;
  vendor: string;
  price: number;
  minQty: number;
  days: number;
}

export const addVendorChange = (tmplId: number, name: string, v: VendorValues): NewChange => ({
  label: `${name}: add vendor ${v.vendor}`,
  model: 'product.supplierinfo',
  method: 'create',
  args: [{ product_tmpl_id: tmplId, partner_id: v.partnerId, price: v.price, min_qty: v.minQty, delay: v.days }],
  already: { model: 'product.supplierinfo', domain: [['product_tmpl_id', '=', tmplId], ['partner_id', '=', v.partnerId], ['price', '=', v.price]] },
});

export const editVendorChange = (line: VendorLine, name: string, v: Omit<VendorValues, 'partnerId' | 'vendor'>): NewChange => ({
  label: `${name}: ${line.vendor} price`,
  model: 'product.supplierinfo',
  method: 'write',
  args: [[line.id], { price: v.price, min_qty: v.minQty, delay: v.days }],
});

export const removeVendorChange = (line: VendorLine, name: string): NewChange => ({ label: `${name}: remove vendor ${line.vendor}`, model: 'product.supplierinfo', method: 'unlink', args: [[line.id]] });

