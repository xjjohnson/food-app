/**
 * The fields of Odoo's product form, grouped the way Odoo groups them and
 * short enough for a phone: Main, Stock, Online shop, Point of Sale.
 * Field names are Odoo 19's; a field this Odoo doesn't have is skipped.
 *
 * Track Inventory, lot tracking and expiry are switches a person may flip
 * for one product here. The app never flips them by itself.
 */
import { m2oId, type OdooClient } from './odoo';
import type { FieldDef, Section } from './odooForm';

type Client = Pick<OdooClient, 'call'>;

export const PRODUCT_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Main',
    fields: [
      { name: 'name', label: 'Name', kind: 'text' },
      { name: 'sale_ok', label: 'Can be sold', kind: 'bool' },
      { name: 'available_in_pos', label: 'Sold in Point of Sale', kind: 'bool' },
      { name: 'purchase_ok', label: 'Can be bought', kind: 'bool' },
      { name: 'list_price', label: 'Price', kind: 'num' },
      { name: 'taxes_id', label: 'Sales taxes', kind: 'many', relation: 'account.tax', domain: [['type_tax_use', '=', 'sale']], hint: 'Picked from Odoo’s list. The app never works out tax.' },
      { name: 'standard_price', label: 'Cost', kind: 'num' },
      { name: 'categ_id', label: 'Product category', kind: 'one', relation: 'product.category' },
      { name: 'default_code', label: 'Internal reference', kind: 'text' },
      { name: 'barcode', label: 'Barcode', kind: 'text' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    fields: [
      { name: 'is_storable', label: 'Track Inventory', kind: 'bool', hint: 'Count stock for this product.' },
      { name: 'tracking', label: 'Track by', kind: 'select', options: [{ id: 'none', label: 'Nothing' }, { id: 'lot', label: 'Batch (lot)' }, { id: 'serial', label: 'Each one' }] },
      { name: 'lot_valuated', label: 'Value stock by batch', kind: 'bool' },
      { name: 'serial_prefix_format', label: 'Batch number pattern', kind: 'text', hint: 'For example %(y)s%(month)s%(day)s' },
      { name: 'use_expiration_date', label: 'Has an expiration date', kind: 'bool' },
      { name: 'expiration_time', label: 'Expires (days after receipt)', kind: 'whole', showWhen: 'use_expiration_date' },
      { name: 'use_time', label: 'Best before (days before expiration)', kind: 'whole', showWhen: 'use_expiration_date' },
      { name: 'removal_time', label: 'Take off the shelf (days before expiration)', kind: 'whole', showWhen: 'use_expiration_date' },
      { name: 'alert_time', label: 'Alert (days before expiration)', kind: 'whole', showWhen: 'use_expiration_date' },
      { name: 'responsible_id', label: 'Responsible', kind: 'one', relation: 'res.users' },
      { name: 'sale_delay', label: 'Customer lead time (days)', kind: 'whole' },
      { name: 'hs_code', label: 'HS code', kind: 'text' },
      { name: 'country_of_origin', label: 'Origin of goods', kind: 'one', relation: 'res.country' },
      { name: 'description_pickingin', label: 'Note on receipts', kind: 'long' },
      { name: 'description_pickingout', label: 'Note on delivery orders', kind: 'long' },
    ],
  },
  {
    id: 'online',
    title: 'Online',
    fields: [
      { name: 'optional_product_ids', label: 'Optional products', kind: 'many', relation: 'product.template' },
      { name: 'accessory_product_ids', label: 'Accessory products', kind: 'many', relation: 'product.product' },
      { name: 'alternative_product_ids', label: 'Alternative products', kind: 'many', relation: 'product.template' },
      { name: 'product_tag_ids', label: 'Tags', kind: 'many', relation: 'product.tag' },
      { name: 'is_published', label: 'Published on the website', kind: 'bool' },
      { name: 'public_categ_ids', label: 'Website categories', kind: 'many', relation: 'product.public.category' },
      { name: 'allow_out_of_stock_order', label: 'Sell when out of stock', kind: 'bool' },
      { name: 'website_ribbon_id', label: 'Ribbon', kind: 'one', relation: 'product.ribbon' },
      { name: 'show_availability', label: 'Show available quantity', kind: 'bool' },
      { name: 'out_of_stock_message', label: 'Out of stock message', kind: 'text' },
      { name: 'description_ecommerce', label: 'Website description', kind: 'html' },
      { name: 'website_description', label: 'Website page text', kind: 'html' },
      { name: 'website_sequence', label: 'Order on the shop page', kind: 'whole' },
      { name: 'available_threshold', label: 'Show “only a few left” at', kind: 'whole' },
      { name: 'website_meta_title', label: 'Search title', kind: 'text' },
      { name: 'website_meta_description', label: 'Search description', kind: 'long' },
      { name: 'website_meta_keywords', label: 'Search keywords', kind: 'text' },
      { name: 'description_sale', label: 'Quotation description', kind: 'long' },
      { name: 'sale_line_warn', label: 'Warning on sales orders', kind: 'select', options: [{ id: 'no-message', label: 'None' }, { id: 'warning', label: 'Warn' }, { id: 'block', label: 'Block' }] },
      { name: 'sale_line_warn_msg', label: 'Warning message', kind: 'long' },
    ],
  },
  {
    id: 'pos',
    title: 'Point of Sale',
    fields: [
      { name: 'to_weight', label: 'Weigh with scale', kind: 'bool' },
      { name: 'pos_categ_ids', label: 'Point of Sale categories', kind: 'many', relation: 'pos.category' },
      { name: 'color', label: 'Color', kind: 'color' },
      { name: 'public_description', label: 'Point of Sale description', kind: 'html' },
      { name: 'pos_optional_product_ids', label: 'Point of Sale optional products', kind: 'many', relation: 'product.product' },
    ],
  },
];

export interface VariantRow {
  id: number;
  name: string;
  onHand: number;
}

export interface LotRow {
  id: number;
  name: string;
  product: string;
  productId: number;
  expiration: string;
  removal: string;
}

export async function loadVariants(c: Client, templateId: number): Promise<VariantRow[]> {
  const rows = (await c.call('product.product', 'search_read', [[['product_tmpl_id', '=', templateId]]], { fields: ['display_name', 'name', 'qty_available'], limit: 100 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.display_name || r.name), onHand: Number(r.qty_available ?? 0) }));
}

export async function loadLots(c: Client, variantIds: number[]): Promise<LotRow[]> {
  if (!variantIds.length) return [];
  const rows = (await c.call('stock.lot', 'search_read', [[['product_id', 'in', variantIds]]], { fields: ['name', 'product_id', 'expiration_date', 'removal_date'], order: 'expiration_date asc', limit: 100 })) as Record<string, unknown>[];
  const d = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), product: typeof r.product_id === 'object' && Array.isArray(r.product_id) ? String(r.product_id[1]) : '', productId: m2oId(r.product_id), expiration: d(r.expiration_date), removal: d(r.removal_date) }));
}

/** The template id of a variant. */
export async function templateOf(c: Client, productId: number): Promise<number> {
  const [p] = (await c.call('product.product', 'read', [[productId]], { fields: ['product_tmpl_id'] })) as Record<string, unknown>[];
  return m2oId(p?.product_tmpl_id);
}

export const productDefs = (sections: Section[]): FieldDef[] => sections.flatMap((s) => s.fields);

/** The fields of one variant (Odoo's product.product form). The cost is set on the product, not here. */
export const VARIANT_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Variant',
    fields: [
      { name: 'default_code', label: 'Internal reference', kind: 'text' },
      { name: 'barcode', label: 'Barcode', kind: 'text' },
      { name: 'lst_price', label: 'Sales price', kind: 'num', hint: 'Includes any extra for this variant. Set in Odoo, shown as is.' },
      { name: 'weight', label: 'Weight', kind: 'num' },
      { name: 'volume', label: 'Volume', kind: 'num' },
      { name: 'active', label: 'In use (switch off to archive)', kind: 'bool' },
    ],
  },
];

/**
 * Where Odoo keeps a product's packagings (Pack of 6 and so on). In Odoo 19 it
 * is a list picked from the units of measure, on the product's Sales tab. The
 * field is found by its label, so no field name is taken on trust. Null when
 * this Odoo has no such list.
 */
export async function findPackagingField(c: Client): Promise<{ name: string; relation: string } | null> {
  const f = (await c.call('product.template', 'fields_get', [], { attributes: ['string', 'type', 'relation'] })) as Record<string, { string?: string; type?: string; relation?: string }>;
  for (const [name, info] of Object.entries(f)) {
    if (info?.string === 'Packagings' && info.type === 'many2many' && info.relation) return { name, relation: info.relation };
  }
  return null;
}
