/**
 * After a purchase order is confirmed: has the delivery come, is there a bill,
 * and how was it paid. Reads Odoo; the one save is "Make the bill", which goes
 * through the offline queue as an `orderbill` step (Odoo makes and posts the
 * bill from what was received, then the payment is registered on the chosen
 * journal). The app never works out amounts; they are Odoo's.
 *
 * Kept free of React; the client is passed in.
 */
import type { NewChange } from './queue';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface PoState {
  name: string;
  /** draft, sent, purchase, done or cancel. */
  state: string;
  /** Deliveries Odoo still waits for. */
  openReceipts: number;
  /** Deliveries that are done. */
  doneReceipts: number;
  /** Bills (not cancelled): id, number and whether paid. */
  bills: { id: number; name: string; paid: boolean }[];
}

export async function loadPoState(c: Client, id: number): Promise<PoState> {
  const [o] = (await c.call('purchase.order', 'read', [[id]], { fields: ['name', 'state', 'picking_ids', 'invoice_ids'] })) as { name?: string; state?: string; picking_ids?: number[]; invoice_ids?: number[] }[];
  const picks = o?.picking_ids?.length ? ((await c.call('stock.picking', 'read', [o.picking_ids], { fields: ['state'] })) as { state?: string }[]) : [];
  const moves = o?.invoice_ids?.length ? ((await c.call('account.move', 'read', [o.invoice_ids], { fields: ['name', 'state', 'payment_state'] })) as { id: number; name?: string; state?: string; payment_state?: string }[]) : [];
  return {
    name: String(o?.name ?? ''),
    state: String(o?.state ?? ''),
    openReceipts: picks.filter((p) => p.state !== 'done' && p.state !== 'cancel').length,
    doneReceipts: picks.filter((p) => p.state === 'done').length,
    bills: moves.filter((m) => m.state !== 'cancel').map((m) => ({ id: m.id, name: m.name && m.name !== '/' ? m.name : 'Draft bill', paid: m.payment_state === 'paid' || m.payment_state === 'in_payment' })),
  };
}

/** Make the bill for an order that was received, and mark it paid when a journal is given. Safe to send twice. */
export function orderBillChange(orderId: number, name: string, journalId: number | null, journalName: string, date: string): NewChange {
  return {
    label: journalId ? `Paid bill for ${name} (${journalName})` : `Bill for ${name}`,
    model: 'purchase.order',
    method: 'bill',
    args: [],
    step: { kind: 'orderbill', orderId, date, journalId },
  };
}

export interface BillPayment {
  date: string;
  /** Cash, Cash App, Venmo... */
  how: string;
  amount: number;
}

/** The payments on a bill: when, how (the journal) and how much. Empty if Odoo does not say. */
export async function loadBillPayments(c: Client, moveId: number): Promise<BillPayment[]> {
  try {
    const [m] = (await c.call('account.move', 'read', [[moveId]], { fields: ['matched_payment_ids'] })) as { matched_payment_ids?: number[] }[];
    const ids = m?.matched_payment_ids ?? [];
    if (!ids.length) return [];
    const rows = (await c.call('account.payment', 'read', [ids], { fields: ['date', 'journal_id', 'amount'] })) as { date?: string | false; journal_id?: [number, string] | false; amount?: number }[];
    return rows.map((r) => ({ date: typeof r.date === 'string' ? r.date : '', how: Array.isArray(r.journal_id) ? String(r.journal_id[1] ?? '') : '', amount: Number(r.amount ?? 0) }));
  } catch {
    return [];
  }
}
