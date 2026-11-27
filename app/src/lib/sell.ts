/**
 * Quotes and orders for customers: a new quote or wholesale order, confirm it,
 * share it as text (or email it from Odoo on tap), make the invoice, and repeat
 * a customer's last order.
 *
 * Every price, discount, tax and total is Odoo's. The app saves what a person
 * typed (customer, products, quantities, dates, terms) and reads the prices
 * and totals back from Odoo. It never works out a price or a tax.
 *
 * Kept free of React; the client is passed in.
 */
import type { Section } from './odooForm';
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';
import type { SubSpec } from './subRecords';

type Client = Pick<OdooClient, 'call'>;

export const SALE_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Quote',
    fields: [
      { name: 'partner_id', label: 'Customer', kind: 'one', relation: 'res.partner', createOnly: true },
    ],
  },
  {
    id: 'more',
    title: 'More details',
    fields: [
      { name: 'partner_invoice_id', label: 'Invoice address', kind: 'one', relation: 'res.partner' },
      { name: 'partner_shipping_id', label: 'Delivery address', kind: 'one', relation: 'res.partner' },
      { name: 'date_order', label: 'Quote date (year-month-day)', kind: 'date' },
      { name: 'validity_date', label: 'Good until (year-month-day)', kind: 'date' },
      { name: 'commitment_date', label: 'Delivery or pickup date (year-month-day)', kind: 'date' },
      { name: 'pricelist_id', label: 'Price list', kind: 'one', relation: 'product.pricelist' },
      { name: 'payment_term_id', label: 'Payment terms (for example Net 30)', kind: 'one', relation: 'account.payment.term' },
      { name: 'client_order_ref', label: 'Customer’s own number', kind: 'text' },
      { name: 'user_id', label: 'Salesperson', kind: 'one', relation: 'res.users' },
      { name: 'team_id', label: 'Sales team', kind: 'one', relation: 'crm.team' },
      { name: 'note', label: 'Terms and notes', kind: 'html' },
    ],
  },
];

const relId = (v: unknown) => (v && !Array.isArray(v) && typeof v === 'object' ? (v as { id: number }).id : 0);
const numOf = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0;

/** A quote's lines. Price is left to Odoo unless the person types one. A case is a unit set on the product. */
export const SO_LINES: SubSpec = {
  model: 'sale.order.line',
  noun: 'line',
  columns: [
    { name: 'product_id', label: 'Product', kind: 'one', relation: 'product.product', domain: [['sale_ok', '=', true]] },
    { name: 'product_uom_qty', label: 'Quantity', kind: 'num' },
    { name: 'product_uom_id', label: 'Unit (for example case)', kind: 'one', relation: 'uom.uom' },
    { name: 'product_uom', label: 'Unit (for example case)', kind: 'one', relation: 'uom.uom' },
    { name: 'price_unit', label: 'Price for one', kind: 'num', hint: 'Leave it to use Odoo’s price for this customer. The app doesn’t work out prices or tax.' },
    { name: 'discount', label: 'Discount %', kind: 'num' },
  ],
  required: ['product_id', 'product_uom_qty'],
  titleColumn: 'product_id',
  already: (d, base) => [['order_id', '=', base.order_id], ['product_id', '=', relId(d.product_id)], ['product_uom_qty', '=', numOf(d.product_uom_qty)]],
};

export const quoteWords = (state: string) => ({ draft: 'Quote', sent: 'Quote sent', sale: 'Confirmed', done: 'Done', cancel: 'Cancelled' }[state] ?? state);

export interface QuoteRow {
  id: number;
  name: string;
  customer: string;
  date: string;
  total: number;
  state: string;
}

const m2oName = (v: unknown) => (Array.isArray(v) ? String(v[1] ?? '') : '');
const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');

/** Open quotes and confirmed orders, newest first. */
export async function loadQuotes(c: Client): Promise<QuoteRow[]> {
  const rows = (await c.call('sale.order', 'search_read', [[['state', 'in', ['draft', 'sent', 'sale']]]], { fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state'], order: 'id desc', limit: 80 })) as Record<string, unknown>[];
  return rows.slice().sort((a, b) => (b.id as number) - (a.id as number)).map((r) => ({ id: r.id as number, name: String(r.name ?? 'Draft'), customer: m2oName(r.partner_id), date: day(r.date_order), total: Number(r.amount_total ?? 0), state: String(r.state ?? '') }));
}

/** Confirm a quote into an order. Odoo makes the delivery. Only on a person's tap. */
export function confirmChange(id: number, name: string): NewChange {
  return { label: `Confirm ${name}`, model: 'sale.order', method: 'action_confirm', args: [[id]] };
}

/** Make the invoice for a confirmed order (a queue step; skipped if the order already has one). */
export function invoiceChange(id: number, name: string): NewChange {
  return { label: `Make the invoice for ${name}`, model: 'sale.order', method: 'action_confirm', args: [], step: { kind: 'saleinvoice', orderId: id } };
}

export async function runSaleInvoice(c: Client, orderId: number): Promise<void> {
  const [o] = (await c.call('sale.order', 'read', [[orderId]], { fields: ['state', 'invoice_ids'] })) as { state?: string; invoice_ids?: number[] }[];
  if (!o) throw new Error('That order is no longer in Odoo.');
  if (o.state !== 'sale' && o.state !== 'done') throw new Error('Confirm the order first, then make the invoice.');
  if ((o.invoice_ids ?? []).length) return;
  const ctx = { active_model: 'sale.order', active_ids: [orderId], active_id: orderId };
  const wiz = (await c.call('sale.advance.payment.inv', 'create', [{ advance_payment_method: 'delivered' }], { context: ctx })) as number;
  await c.call('sale.advance.payment.inv', 'create_invoices', [[wiz]], { context: ctx });
}

/** A new quote copied from an earlier order, for a repeat customer. Made once even if sent twice. */
export function repeatChange(orderId: number, customer: string, now = Date.now()): NewChange {
  const token = `food-app-repeat-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Repeat the last order for ${customer}`,
    model: 'sale.order',
    method: 'copy',
    args: [[orderId], { origin: token }],
    already: { model: 'sale.order', domain: [['origin', '=', token]] },
  };
}

export interface RepeatRow {
  partnerId: number;
  customer: string;
  lastOrderId: number;
  lastDate: string;
  orders: number;
  /** About how many days between orders (needs two or more orders), else null. */
  every: number | null;
  sinceDays: number;
}

const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);

/** Customers with confirmed orders: how often they order and how long since the last. The most overdue first. */
export async function loadRepeatList(c: Client, now = new Date()): Promise<RepeatRow[]> {
  const rows = (await c.call('sale.order', 'search_read', [[['state', 'in', ['sale', 'done']]]], { fields: ['partner_id', 'date_order'], order: 'date_order asc', limit: 600 })) as Record<string, unknown>[];
  const today = dayNum(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  const by = new Map<number, { name: string; dates: string[]; ids: number[] }>();
  for (const r of rows.slice().sort((a, b) => day(a.date_order).localeCompare(day(b.date_order)))) {
    const pid = Array.isArray(r.partner_id) ? (r.partner_id[0] as number) : 0;
    if (!pid) continue;
    const e = by.get(pid) ?? { name: m2oName(r.partner_id), dates: [], ids: [] };
    e.dates.push(day(r.date_order));
    e.ids.push(r.id as number);
    by.set(pid, e);
  }
  const out: RepeatRow[] = [...by.entries()].map(([partnerId, e]) => {
    const last = e.dates[e.dates.length - 1]!;
    const every = e.dates.length >= 2 ? Math.round((dayNum(last) - dayNum(e.dates[0]!)) / (e.dates.length - 1)) : null;
    return { partnerId, customer: e.name, lastOrderId: e.ids[e.ids.length - 1]!, lastDate: last, orders: e.dates.length, every, sinceDays: today - dayNum(last) };
  });
  // Overdue ones first: days since last minus the usual gap; customers with one order come last.
  const late = (r: RepeatRow) => (r.every === null ? -9999 : r.sinceDays - r.every);
  return out.sort((a, b) => late(b) - late(a) || a.customer.localeCompare(b.customer));
}

/** The quote as plain text for the share sheet. All numbers are read back from Odoo. */
export async function quoteText(c: Client, id: number): Promise<string> {
  const [o] = (await c.call('sale.order', 'read', [[id]], { fields: ['name', 'partner_id', 'date_order', 'validity_date', 'commitment_date', 'payment_term_id', 'amount_untaxed', 'amount_tax', 'amount_total', 'note', 'state'] })) as Record<string, unknown>[];
  if (!o) throw new Error('That quote is no longer in Odoo.');
  const lines = (await c.call('sale.order.line', 'search_read', [[['order_id', '=', id], ['display_type', '=', false]]], { fields: ['product_id', 'name', 'product_uom_qty', 'price_unit', 'discount', 'price_subtotal'], order: 'id asc' })) as Record<string, unknown>[];
  const m = (n: unknown) => Number(n ?? 0).toFixed(2);
  const out = [`${quoteWords(String(o.state))} ${o.name}`, `For ${m2oName(o.partner_id)}`, `Date ${day(o.date_order)}`];
  if (day(o.validity_date)) out.push(`Good until ${day(o.validity_date)}`);
  if (day(o.commitment_date)) out.push(`Delivery or pickup ${day(o.commitment_date)}`);
  if (m2oName(o.payment_term_id)) out.push(`Terms: ${m2oName(o.payment_term_id)}`);
  out.push('');
  for (const l of lines) out.push(`${Number(l.product_uom_qty ?? 0)} x ${m2oName(l.product_id) || String(l.name ?? '')}  at ${m(l.price_unit)}${Number(l.discount) ? ` less ${Number(l.discount)}%` : ''} = ${m(l.price_subtotal)}`);
  out.push('', `Before tax ${m(o.amount_untaxed)}`, `Tax ${m(o.amount_tax)}`, `Total ${m(o.amount_total)}`);
  const note = typeof o.note === 'string' ? o.note.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (note) out.push('', note);
  return out.join('\n');
}

/** Email the quote from Odoo, with Odoo's own template. Only on a person's tap, with signal. */
export async function emailQuote(c: Client, id: number): Promise<void> {
  const ctx = { active_model: 'sale.order', active_ids: [id], active_id: id };
  const wiz = (await c.call('sale.order.send', 'create', [{ res_ids: [id] }], { context: ctx })) as number;
  await c.call('sale.order.send', 'action_send_mail', [[wiz]], { context: ctx });
}
