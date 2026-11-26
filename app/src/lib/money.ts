/**
 * The Money list: customer invoices and vendor bills, read from Odoo
 * (account.move). Used by Invoices (who owes, who paid) and Purchase history
 * (every purchase bill). Read only, newest first. The only save is "Mark
 * paid", which goes through the offline queue as a payment on the existing
 * invoice or bill. The app never works out totals, taxes or what is owed:
 * every number is Odoo's own.
 *
 * Kept free of React; the client is passed in.
 */
import type { NewChange } from './queue';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

/** out: what customers owe us (invoices). in: what we bought (vendor bills). */
export type MoneyKind = 'out' | 'in';
export type Show = 'owed' | 'paid' | 'all';

export interface MoneyRow {
  id: number;
  name: string;
  who: string;
  date: string;
  due: string;
  total: number;
  left: number;
  paid: boolean;
  /** Draft, posted or cancelled in Odoo. */
  state: string;
  origin: string;
  /** Shop orders carry the order number as their origin. */
  ref: string;
}

export interface MoneyLine {
  id: number;
  name: string;
  qty: number;
  price: number;
  subtotal: number;
}

const FIELDS = ['name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'payment_state', 'state', 'invoice_origin', 'ref'];

const isPaid = (p: unknown) => p === 'paid' || p === 'in_payment';

function toRow(r: Record<string, unknown>): MoneyRow {
  const who = Array.isArray(r.partner_id) ? String(r.partner_id[1] ?? '') : '';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id: r.id as number,
    name: str(r.name) || 'Draft',
    who,
    date: str(r.invoice_date),
    due: str(r.invoice_date_due),
    total: Number(r.amount_total ?? 0),
    left: Number(r.amount_residual ?? 0),
    paid: isPaid(r.payment_state),
    state: str(r.state),
    origin: str(r.invoice_origin),
    ref: str(r.ref),
  };
}

/** Newest first, cancelled left out. `partnerId` narrows it to one contact. */
export async function loadMoney(c: Client, kind: MoneyKind, opts: { partnerId?: number; limit?: number } = {}): Promise<MoneyRow[]> {
  const domain: unknown[] = [['move_type', '=', kind === 'out' ? 'out_invoice' : 'in_invoice'], ['state', '!=', 'cancel']];
  if (opts.partnerId) domain.push(['partner_id', '=', opts.partnerId]);
  const rows = (await c.call('account.move', 'search_read', [domain], { fields: FIELDS, order: 'invoice_date desc, id desc', limit: opts.limit ?? 200 })) as Record<string, unknown>[];
  return rows.map(toRow);
}

/** The lines on one invoice or bill, as Odoo has them. */
export async function loadMoneyLines(c: Client, moveId: number): Promise<MoneyLine[]> {
  const rows = (await c.call('account.move.line', 'search_read', [[['move_id', '=', moveId], ['display_type', '=', 'product']]], { fields: ['name', 'product_id', 'quantity', 'price_unit', 'price_subtotal'], order: 'id asc' })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: (Array.isArray(r.product_id) ? String(r.product_id[1] ?? '') : '') || String(r.name ?? ''),
    qty: Number(r.quantity ?? 0),
    price: Number(r.price_unit ?? 0),
    subtotal: Number(r.price_subtotal ?? 0),
  }));
}

/** Owed, Paid or All. Drafts count as not paid. */
export const filterMoney = (rows: MoneyRow[], show: Show, text: string): MoneyRow[] => {
  const t = text.trim().toLowerCase();
  return rows.filter((r) => (show === 'all' ? true : show === 'paid' ? r.paid : !r.paid) && (!t || `${r.name} ${r.who} ${r.origin} ${r.ref}`.toLowerCase().includes(t)));
};

export const stateWords = (r: MoneyRow) => (r.state === 'draft' ? 'Draft' : r.paid ? 'Paid' : r.left > 0 && r.left < r.total ? 'Part paid' : 'Not paid');

/** Marks one invoice or bill paid. Goes through the queue, so it works with no signal and never pays twice. */
export function payChange(row: MoneyRow, journalId: number, journalName: string, date: string): NewChange {
  return {
    label: `Paid ${row.name} (${row.who || 'no name'}) with ${journalName}`,
    model: 'account.move',
    method: 'pay',
    args: [],
    step: { kind: 'pay', moveId: row.id, date, journalId },
  };
}
