/**
 * Adding and changing things from the app: recipes, products, contacts and
 * batch details. Each is a change for the offline queue, so it reaches Odoo
 * in order, and Odoo (with the person's own access rights) has the last word.
 *
 * The app never switches an Odoo setting on: a new product is made without
 * "Track Inventory", and the screen says to turn that on in Odoo if stock is
 * counted for it. Prices are only what a person types; the app never works
 * out a price or a tax.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const token = (now: number) => `food-app-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- recipes

export interface RecipeLineRow {
  id: number;
  productId: number;
  name: string;
  qty: number;
}

export interface RecipeDetail {
  id: number;
  name: string;
  productId: number;
  makes: number;
  unit: string;
  lines: RecipeLineRow[];
}

export async function loadRecipeDetail(c: Client, bomId: number): Promise<RecipeDetail | null> {
  const [b] = (await c.call('mrp.bom', 'read', [[bomId]], { fields: ['product_tmpl_id', 'product_id', 'product_qty', 'product_uom_id', 'bom_line_ids'] })) as Record<string, unknown>[];
  if (!b) return null;
  const ids = (b.bom_line_ids as number[]) ?? [];
  const lines = ids.length ? ((await c.call('mrp.bom.line', 'read', [ids], { fields: ['product_id', 'product_qty'] })) as Record<string, unknown>[]) : [];
  return {
    id: bomId,
    name: nameOf(b.product_id) || nameOf(b.product_tmpl_id),
    productId: m2oId(b.product_id),
    makes: Number(b.product_qty ?? 1),
    unit: nameOf(b.product_uom_id),
    lines: lines.map((l) => ({ id: l.id as number, productId: m2oId(l.product_id), name: nameOf(l.product_id), qty: Number(l.product_qty ?? 0) })),
  };
}

export const setRecipeMakesChange = (r: Pick<RecipeDetail, 'id' | 'name'>, qty: number): NewChange => ({ label: `Recipe ${r.name} makes ${qty}`, model: 'mrp.bom', method: 'write', args: [[r.id], { product_qty: qty }] });
export const setLineQtyChange = (r: Pick<RecipeDetail, 'name'>, l: RecipeLineRow, qty: number): NewChange => ({ label: `${r.name}: ${l.name} ${qty}`, model: 'mrp.bom.line', method: 'write', args: [[l.id], { product_qty: qty }] });
export const removeLineChange = (r: Pick<RecipeDetail, 'name'>, l: RecipeLineRow): NewChange => ({ label: `${r.name}: remove ${l.name}`, model: 'mrp.bom.line', method: 'unlink', args: [[l.id]] });
export const addLineChange = (r: Pick<RecipeDetail, 'id' | 'name'>, productId: number, productName: string, qty: number): NewChange => ({
  label: `${r.name}: add ${productName} ${qty}`,
  model: 'mrp.bom.line',
  method: 'create',
  args: [{ bom_id: r.id, product_id: productId, product_qty: qty }],
  already: { model: 'mrp.bom.line', domain: [['bom_id', '=', r.id], ['product_id', '=', productId]] },
});

/** A new recipe for a product: how many it makes and its ingredients. */
export async function newRecipeChange(c: Client, productId: number, productName: string, makes: number, lines: { productId: number; qty: number }[], now = Date.now()): Promise<NewChange> {
  const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['product_tmpl_id'] })) as Record<string, unknown>[];
  const code = token(now);
  return {
    label: `New recipe: ${productName}`,
    model: 'mrp.bom',
    method: 'create',
    args: [{ product_tmpl_id: m2oId(p?.product_tmpl_id), product_id: productId, product_qty: makes, type: 'normal', code, bom_line_ids: lines.map((l) => [0, 0, { product_id: l.productId, product_qty: l.qty }]) }],
    already: { model: 'mrp.bom', domain: [['code', '=', code]] },
  };
}

// --------------------------------------------------------------- products

export interface ProductDetail {
  id: number;
  tmplId: number;
  name: string;
  price: number;
  /** Days, or null when Odoo has no shelf-life field or none is set. */
  shelfLife: number | null;
  hasShelfLife: boolean;
}

export async function loadProductDetail(c: Client, productId: number): Promise<ProductDetail | null> {
  const fields = (await c.call('product.template', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  const hasShelfLife = 'expiration_time' in fields;
  const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['name', 'list_price', 'product_tmpl_id', ...(hasShelfLife ? ['expiration_time'] : [])] })) as Record<string, unknown>[];
  if (!p) return null;
  const days = Number(p.expiration_time ?? 0);
  return { id: productId, tmplId: m2oId(p.product_tmpl_id), name: String(p.name), price: Number(p.list_price ?? 0), shelfLife: days > 0 ? days : null, hasShelfLife };
}

export function editProductChange(p: ProductDetail, v: { name: string; price: number; shelfLife: number | null }): NewChange {
  return {
    label: `Product ${v.name}`,
    model: 'product.template',
    method: 'write',
    args: [[p.tmplId], { name: v.name.trim(), list_price: v.price, ...(p.hasShelfLife && v.shelfLife !== null ? { expiration_time: v.shelfLife } : {}) }],
  };
}

export async function hasShelfLifeField(c: Client): Promise<boolean> {
  const fields = (await c.call('product.template', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  return 'expiration_time' in fields;
}

/** A new product to sell. Made without "Track Inventory": the owner turns that on in Odoo. */
export function newProductChange(v: { name: string; price: number; shelfLife: number | null }, hasShelfLife: boolean): NewChange {
  return {
    label: `New product: ${v.name.trim()}`,
    model: 'product.template',
    method: 'create',
    args: [{ name: v.name.trim(), list_price: v.price, sale_ok: true, ...(hasShelfLife && v.shelfLife !== null ? { expiration_time: v.shelfLife } : {}) }],
    already: { model: 'product.template', domain: [['name', '=', v.name.trim()]] },
  };
}

// -------------------------------------------------------------- contacts

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
}

export async function searchContacts(c: Client, text: string): Promise<Contact[]> {
  const rows = (await c.call('res.partner', 'search_read', [text.trim() ? [['name', 'ilike', text.trim()]] : []], { fields: ['name', 'phone', 'email'], order: 'name asc', limit: 30 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), phone: typeof r.phone === 'string' ? r.phone : '', email: typeof r.email === 'string' ? r.email : '' }));
}

export const editContactChange = (id: number, v: { name: string; phone: string; email: string }): NewChange => ({
  label: `Contact ${v.name.trim()}`,
  model: 'res.partner',
  method: 'write',
  args: [[id], { name: v.name.trim(), phone: v.phone.trim() || false, email: v.email.trim() || false }],
});

export const newContactChange = (v: { name: string; phone: string; email: string }): NewChange => ({
  label: `New contact: ${v.name.trim()}`,
  model: 'res.partner',
  method: 'create',
  args: [{ name: v.name.trim(), ...(v.phone.trim() ? { phone: v.phone.trim() } : {}), ...(v.email.trim() ? { email: v.email.trim() } : {}) }],
  already: { model: 'res.partner', domain: [['name', '=', v.name.trim()]] },
});

// ----------------------------------------------------------------- batches

/** Fix a batch's number or use-by date. `useBy` is "YYYY-MM-DD" or '' to leave it as it is. */
export function editLotChange(lotId: number, v: { name: string; useBy: string }): NewChange {
  return {
    label: `Batch ${v.name.trim()}`,
    model: 'stock.lot',
    method: 'write',
    args: [[lotId], { name: v.name.trim(), ...(v.useBy ? { expiration_date: `${v.useBy} 12:00:00` } : {}) }],
  };
}
