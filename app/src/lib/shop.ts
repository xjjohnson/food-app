/**
 * The online shop (Odoo's Website): which products are on it, new website
 * orders, specials (discount codes), delivery and pickup, closed days, how an
 * order went, and who sent a customer.
 *
 * Odoo does all price, discount and delivery math. The app saves what a person
 * typed or switched and reads the rest. Nothing is sent to customers.
 *
 * Kept free of React; the client is passed in.
 */
import { loadSettings, settingChange } from './appSettings';
import type { Section } from './odooForm';
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface ShopRow {
  id: number;
  name: string;
  price: number;
  onShop: boolean;
  sellWhenOut: boolean;
}

/** Sellable products with their shop switches. */
export async function loadShop(c: Client): Promise<ShopRow[]> {
  const fields = (await c.call('product.template', 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  if (!('is_published' in fields)) throw new Error('This Odoo has no Website app, so there is no shop to switch.');
  const rows = (await c.call('product.template', 'search_read', [[['sale_ok', '=', true]]], { fields: ['name', 'list_price', 'is_published', ...('allow_out_of_stock_order' in fields ? ['allow_out_of_stock_order'] : [])], order: 'name asc, id asc', limit: 200 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), price: Number(r.list_price ?? 0), onShop: !!r.is_published, sellWhenOut: !!r.allow_out_of_stock_order }));
}

/** One of a product's own shop switches. Always a person's tap. */
export function shopSwitch(id: number, name: string, field: 'is_published' | 'allow_out_of_stock_order', value: boolean): NewChange {
  const words = field === 'is_published' ? (value ? 'On the shop' : 'Off the shop') : value ? 'Sell when out of stock' : 'Sold out when empty';
  return { label: `${name}: ${words}`, model: 'product.template', method: 'write', args: [[id], { [field]: value }] };
}

export interface WebOrder {
  id: number;
  name: string;
  customer: string;
  total: number;
  date: string;
  state: string;
}

/** Website orders from the last few days, newest first. */
export async function loadWebOrders(c: Client, days = 3, now = new Date()): Promise<WebOrder[]> {
  const since = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const rows = (await c.call('sale.order', 'search_read', [[['website_id', '!=', false], ['state', 'in', ['draft', 'sent', 'sale']], ['date_order', '>=', `${since} 00:00:00`]]], { fields: ['name', 'partner_id', 'amount_total', 'date_order', 'state'], order: 'id desc', limit: 50 })) as Record<string, unknown>[];
  return rows.slice().sort((a, b) => (b.id as number) - (a.id as number)).map((r) => ({ id: r.id as number, name: String(r.name), customer: Array.isArray(r.partner_id) ? String(r.partner_id[1] ?? '') : '', total: Number(r.amount_total ?? 0), date: String(r.date_order ?? '').slice(0, 16), state: String(r.state) }));
}

export interface Special {
  id: number;
  name: string;
  active: boolean;
  from: string;
  to: string;
  code: string;
}

/** Discount programs Odoo has. */
export async function loadSpecials(c: Client): Promise<Special[]> {
  const rows = (await c.call('loyalty.program', 'search_read', [[['program_type', 'in', ['promo_code', 'coupons', 'next_order_coupons']]]], { fields: ['name', 'active', 'date_from', 'date_to', 'rule_ids'], order: 'id desc', limit: 50 })) as Record<string, unknown>[];
  const ruleIds = rows.flatMap((r) => (r.rule_ids as number[]) ?? []);
  const rules = ruleIds.length ? ((await c.call('loyalty.rule', 'read', [ruleIds], { fields: ['code'] })) as { id: number; code?: string }[]) : [];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), active: r.active !== false, from: typeof r.date_from === 'string' ? r.date_from.slice(0, 10) : '', to: typeof r.date_to === 'string' ? r.date_to.slice(0, 10) : '', code: rules.find((x) => ((r.rule_ids as number[]) ?? []).includes(x.id) && x.code)?.code ?? '' }));
}

export interface SpecialInput {
  name: string;
  code: string;
  percent: number;
  from: string;
  to: string;
  maxUses: number | null;
}

export function specialProblems(i: { name: string; code: string; percentText: string; from: string; to: string }): string[] {
  const out: string[] = [];
  const pct = Number(i.percentText.replace(',', '.'));
  if (!i.name.trim()) out.push('Give the special a name.');
  if (!/^[A-Za-z0-9_-]{3,}$/.test(i.code.trim())) out.push('The code needs at least 3 letters or numbers, no spaces.');
  if (!(pct > 0 && pct <= 100)) out.push('The percent off must be between 1 and 100.');
  for (const d of [i.from, i.to]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) out.push('Dates look like 2026-12-01.');
  if (i.from && i.to && i.to < i.from) out.push('The end date is before the start date.');
  return out;
}

/** A code for a percent off the whole order. Odoo does the discount math; made once per code. */
export function specialChange(i: SpecialInput): NewChange {
  const code = i.code.trim();
  return {
    label: `Special ${i.name.trim()} (${code})`,
    model: 'loyalty.program',
    method: 'create',
    args: [
      {
        name: i.name.trim(),
        program_type: 'promo_code',
        trigger: 'with_code',
        applies_on: 'current',
        date_from: i.from || false,
        date_to: i.to || false,
        limit_usage: i.maxUses !== null,
        max_usage: i.maxUses ?? 0,
        rule_ids: [[0, 0, { mode: 'with_code', code, minimum_amount: 0 }]],
        reward_ids: [[0, 0, { reward_type: 'discount', discount_mode: 'percent', discount: i.percent, discount_applicability: 'order' }]],
      },
    ],
    already: { model: 'loyalty.program', domain: [['name', '=', i.name.trim()], ['program_type', '=', 'promo_code']] },
  };
}

/** Turn a special off (or on again) without deleting it. */
export const specialActive = (id: number, name: string, active: boolean): NewChange => ({ label: `${active ? 'Turn on' : 'Turn off'} special ${name}`, model: 'loyalty.program', method: 'write', args: [[id], { active }] });

export const CARRIER_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Delivery or pickup',
    fields: [
      { name: 'name', label: 'Name (for example Local delivery, Pickup)', kind: 'text' },
      { name: 'delivery_type', label: 'Kind', kind: 'select', options: [{ id: 'fixed', label: 'Delivery for a set price' }, { id: 'base_on_rule', label: 'Price by rules' }, { id: 'onsite', label: 'Pickup at the shop' }] },
      { name: 'fixed_price', label: 'Price', kind: 'num' },
      { name: 'free_over', label: 'Free over an amount', kind: 'bool' },
      { name: 'amount', label: 'Free over this amount', kind: 'num', showWhen: 'free_over' },
      { name: 'country_ids', label: 'Countries', kind: 'many', relation: 'res.country' },
      { name: 'state_ids', label: 'States', kind: 'many', relation: 'res.country.state' },
      { name: 'zip_from', label: 'Zip codes from', kind: 'text' },
      { name: 'zip_to', label: 'Zip codes to', kind: 'text' },
      { name: 'is_published', label: 'On the website', kind: 'bool' },
      { name: 'website_id', label: 'Website', kind: 'one', relation: 'website' },
      { name: 'company_id', label: 'Company', kind: 'one', relation: 'res.company' },
    ],
  },
];

export interface Carrier {
  id: number;
  name: string;
  kind: string;
  price: number;
  zips: string;
  onSite: boolean;
}

export async function loadCarriers(c: Client): Promise<Carrier[]> {
  const rows = (await c.call('delivery.carrier', 'search_read', [[]], { fields: ['name', 'delivery_type', 'fixed_price', 'zip_from', 'zip_to', 'is_published'], order: 'name asc, id asc', limit: 50 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), kind: String(r.delivery_type ?? ''), price: Number(r.fixed_price ?? 0), zips: [r.zip_from, r.zip_to].filter(Boolean).join(' to '), onSite: r.delivery_type === 'onsite' }));
}

/** Days the shop is closed: warning only, nothing stops an order. Kept in the Food app settings. */
export const closedKey = (date: string) => `closed.${date}`;

export async function loadClosedDays(c: Client, from: string): Promise<string[]> {
  const s = await loadSettings(c);
  return Object.keys(s).filter((k) => k.startsWith('closed.') && s[k] === '1' && k.slice(7) >= from).map((k) => k.slice(7)).sort();
}

export const closeDayChange = (date: string, closed: boolean) => settingChange(closedKey(date), closed ? '1' : '0');
export const isClosed = (s: Record<string, string>, date: string) => s[closedKey(date)] === '1';

/** How an order went: stars and a comment, as one note on the order (once). */
export function feedbackChange(orderId: number, orderName: string, stars: number, comment: string): NewChange {
  const tag = `food-app-feedback-${orderId}`;
  return {
    label: `How ${orderName} went`,
    model: 'sale.order',
    method: 'message_post',
    args: [],
    step: { kind: 'note', model: 'sale.order', resId: orderId, tag, body: `How did it go? ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} (${stars} of 5)${comment.trim() ? ` ${comment.trim().replace(/[<&]/g, ' ')}` : ''}` },
  };
}

/** The stars on an order, or null when none was recorded. */
export async function loadFeedback(c: Client, orderId: number): Promise<number | null> {
  const m = (await c.call('mail.message', 'search_read', [[['model', '=', 'sale.order'], ['res_id', '=', orderId], ['body', 'ilike', `food-app-feedback-${orderId}`]]], { fields: ['body'], limit: 1 })) as { body?: string }[];
  const hit = /\((\d) of 5\)/.exec(String(m[0]?.body ?? ''));
  return hit ? Number(hit[1]) : null;
}

export interface Referral {
  id: number;
  name: string;
  orders: number;
}

export const referralTag = (name: string) => `Referred by ${name}`;

/** Customers tagged as sent by this person, with how many orders each has. Counts only; no rewards are sent. */
export async function loadReferrals(c: Client, name: string): Promise<Referral[]> {
  const tags = (await c.call('res.partner.category', 'search', [[['name', '=', referralTag(name)]]], {})) as number[];
  if (!tags.length) return [];
  const people = (await c.call('res.partner', 'search_read', [[['category_id', 'in', tags]]], { fields: ['name'], order: 'name asc', limit: 100 })) as { id: number; name: string }[];
  const out: Referral[] = [];
  for (const p of people) out.push({ id: p.id, name: p.name, orders: Number(await c.call('sale.order', 'search_count', [[['partner_id', '=', p.id], ['state', 'in', ['sale', 'done']]]])) || 0 });
  return out;
}

/** Mark a customer as sent by someone: adds the tag (made the first time). */
export async function tagReferral(c: Client, partnerId: number, byName: string): Promise<void> {
  const name = referralTag(byName);
  let [tag] = (await c.call('res.partner.category', 'search', [[['name', '=', name]]], {})) as number[];
  if (!tag) tag = (await c.call('res.partner.category', 'create', [{ name }], {})) as number;
  await c.call('res.partner', 'write', [[partnerId], { category_id: [[4, tag]] }], {});
}

export interface Group {
  id: number;
  name: string;
  currency: string;
  rules: number;
}

/** Customer groups: Odoo price lists. Odoo applies them on orders; the app only shows and edits them. */
export async function loadGroups(c: Client): Promise<Group[]> {
  const rows = (await c.call('product.pricelist', 'search_read', [[]], { fields: ['name', 'currency_id', 'item_ids'], order: 'name asc, id asc', limit: 50 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), currency: Array.isArray(r.currency_id) ? String(r.currency_id[1] ?? '') : '', rules: Array.isArray(r.item_ids) ? r.item_ids.length : 0 }));
}

export const GROUP_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Customer group (price list)',
    fields: [
      { name: 'name', label: 'Name (for example Wholesale)', kind: 'text' },
      { name: 'currency_id', label: 'Currency', kind: 'one', relation: 'res.currency' },
      { name: 'company_id', label: 'Company', kind: 'one', relation: 'res.company' },
      { name: 'active', label: 'In use', kind: 'bool' },
    ],
  },
];

const relIdOf = (v: unknown) => (v && !Array.isArray(v) && typeof v === 'object' ? (v as { id: number }).id : 0);
const numOf2 = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0;

/** One rule of a price list. Odoo works out the price from the rule. */
export const GROUP_RULES: import('./subRecords').SubSpec = {
  model: 'product.pricelist.item',
  noun: 'rule',
  columns: [
    { name: 'applied_on', label: 'Applies to', kind: 'select', options: [{ id: '3_global', label: 'All products' }, { id: '2_product_category', label: 'A product category' }, { id: '1_product', label: 'One product' }, { id: '0_product_variant', label: 'One product variant' }] },
    { name: 'categ_id', label: 'Category (if a category)', kind: 'one', relation: 'product.category' },
    { name: 'product_tmpl_id', label: 'Product (if one product)', kind: 'one', relation: 'product.template' },
    { name: 'compute_price', label: 'Price is', kind: 'select', options: [{ id: 'fixed', label: 'A set price' }, { id: 'percentage', label: 'A percent off' }] },
    { name: 'fixed_price', label: 'Set price', kind: 'num' },
    { name: 'percent_price', label: 'Percent off', kind: 'num' },
    { name: 'min_quantity', label: 'From this quantity', kind: 'num' },
    { name: 'date_start', label: 'Starts (year-month-day)', kind: 'date' },
    { name: 'date_end', label: 'Ends (year-month-day)', kind: 'date' },
  ],
  required: ['applied_on', 'compute_price'],
  titleColumn: 'applied_on',
  already: (d, base) => [['pricelist_id', '=', base.pricelist_id], ['applied_on', '=', String(d.applied_on ?? '')], ['product_tmpl_id', '=', relIdOf(d.product_tmpl_id) || false], ['fixed_price', '=', numOf2(d.fixed_price)], ['percent_price', '=', numOf2(d.percent_price)]],
};
