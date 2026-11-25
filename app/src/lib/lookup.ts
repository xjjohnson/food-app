/**
 * Product lookup: search a product and see its price, photo and stock by batch,
 * all as Odoo has them. The price is the one set on the product in Odoo and is
 * shown as is: the app never works out taxes, discounts or price lists.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import { loadLotStock, type LotStock } from './orders';

type Client = Pick<OdooClient, 'call'>;

export interface ProductCard {
  id: number;
  name: string;
  /** The price on the product in Odoo, or null when Odoo won't say. */
  price: number | null;
  onHand: number;
  /** Base64 picture, or ''. */
  photo: string;
}

export async function lookupProducts(c: Client, text: string): Promise<ProductCard[]> {
  const rows = (await c.call('product.product', 'search_read', [text.trim() ? [['name', 'ilike', text.trim()]] : []], { fields: ['name', 'list_price', 'qty_available', 'image_128'], order: 'name asc', limit: 25 })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: String(r.name),
    price: typeof r.list_price === 'number' ? r.list_price : null,
    onHand: Number(r.qty_available ?? 0),
    photo: typeof r.image_128 === 'string' ? r.image_128 : '',
  }));
}

export interface ProductGroup {
  /** The product (template) id. */
  id: number;
  name: string;
  price: number | null;
  /** Total on hand across all its variants, as Odoo adds it up. */
  onHand: number;
  variants: number;
  photo: string;
}

/** One row per product, however many variants it has. */
export async function lookupGroups(c: Client, text: string): Promise<ProductGroup[]> {
  const rows = (await c.call('product.template', 'search_read', [text.trim() ? [['name', 'ilike', text.trim()]] : []], { fields: ['name', 'list_price', 'qty_available', 'product_variant_count', 'image_128'], order: 'name asc', limit: 25 })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: String(r.name),
    price: typeof r.list_price === 'number' ? r.list_price : null,
    onHand: Number(r.qty_available ?? 0),
    variants: Number(r.product_variant_count ?? 1),
    photo: typeof r.image_128 === 'string' ? r.image_128 : '',
  }));
}

/** Stock by batch for all of a product's variants, soonest use-by first. */
export async function stockByBatchOf(c: Client, templateId: number): Promise<LotStock[]> {
  const vs = (await c.call('product.product', 'search', [[['product_tmpl_id', '=', templateId]]])) as number[];
  if (!vs.length) return [];
  return (await loadLotStock(c, vs)).sort((a, b) => (a.useBy || '9999').localeCompare(b.useBy || '9999'));
}

/** Stock by batch, soonest use-by first. */
export async function stockByBatch(c: Client, productId: number): Promise<LotStock[]> {
  return (await loadLotStock(c, productId)).sort((a, b) => (a.useBy || '9999').localeCompare(b.useBy || '9999'));
}

/** The company's currency symbol from Odoo ("$"), or '' when it can't be read. */
export async function currencySymbol(c: Client, companyId: number): Promise<string> {
  try {
    const [co] = (await c.call('res.company', 'read', [[companyId]], { fields: ['currency_id'] })) as Record<string, unknown>[];
    const cur = m2oId(co?.currency_id);
    if (!cur) return '';
    const [r] = (await c.call('res.currency', 'read', [[cur]], { fields: ['symbol'] })) as { symbol?: string }[];
    return r?.symbol ?? '';
  } catch {
    return '';
  }
}
