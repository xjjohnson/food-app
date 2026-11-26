/**
 * The steps after a purchase order is made, for "Bought ingredients": receive
 * the delivery Odoo made for the order, then make the vendor bill and mark it
 * paid. They run from the offline queue, in order, after the order itself.
 *
 * Each step finds its order by the token the order carries in its Source
 * Document, so it works even when the order was made later (no signal at the
 * shop) and runs safely twice: a delivery that is done, a bill that is posted
 * or paid is left alone. The app never works out prices, taxes or costs; the
 * price paid goes on the order line, and Odoo does the rest.
 *
 * Kept free of React; the client is passed in.
 */
import { lineValues, loadReceiptLines } from './ingredients';
import { runSetting } from './appSettings';
import { runMove } from './places';
import { runPhoto } from './photos';
import { runSaleInvoice } from './sell';
import { runExpense, type ExpenseStep } from './expense';
import { runCount } from './stock';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export type Step =
  | {
      kind: 'receive';
      token: string;
      /** What came, by product, in the order they were entered. */
      lines: { productId: number; qty: number; lot: string; useBy: string }[];
    }
  | {
      kind: 'bill';
      token: string;
      /** Bill date, "YYYY-MM-DD". */
      date: string;
      /** The payment journal (Cash, Bank...) the bill was paid from, or null for "not paid yet". */
      journalId: number | null;
    }
  | ExpenseStep
  | { kind: 'saleinvoice'; orderId: number }
  /** Invoice an order, post it, and optionally mark it paid (pay on delivery). */
  | { kind: 'salepay'; orderId: number; date: string; journalId: number | null }
  | { kind: 'setting'; key: string; value: string }
  /** A picture on a record. `uri` is the file waiting on the phone. */
  | { kind: 'photo'; model: string; resId: number; name: string; uri: string }
  | { kind: 'count'; quantId: number; counted: number; expected: number }
  | { kind: 'move'; token: string; productId: number; lotId: number; qty: number; fromId: number; toId: number }
  | {
      /** A note on a record's chatter, posted once (Delivered on the delivery board). */
      kind: 'note';
      model: string;
      resId: number;
      /** Identifies the note, so a retry never posts it twice. */
      tag: string;
      body: string;
    }
  | {
      /** Mark a bill or invoice that already exists as paid (Invoices and Purchase history). */
      kind: 'pay';
      moveId: number;
      date: string;
      journalId: number;
    };

async function orderByToken(c: Client, token: string): Promise<{ id: number; state: string; pickings: number[]; bills: number[] } | null> {
  const [o] = (await c.call('purchase.order', 'search_read', [[['origin', '=', token]]], { fields: ['state', 'picking_ids', 'invoice_ids'], limit: 1 })) as Record<string, unknown>[];
  if (!o) return null;
  return { id: o.id as number, state: String(o.state ?? ''), pickings: (o.picking_ids as number[]) ?? [], bills: (o.invoice_ids as number[]) ?? [] };
}

/** Puts what came on the order's delivery and validates it. A delivery already done is left alone. */
async function receive(c: Client, step: Extract<Step, { kind: 'receive' }>): Promise<void> {
  const o = await orderByToken(c, step.token);
  if (!o) throw new Error('The order for this purchase is not in Odoo yet.');
  if (o.state !== 'purchase' && o.state !== 'done') throw new Error('The order is not confirmed in Odoo, so it has no delivery to receive.');
  const open = o.pickings.length ? ((await c.call('stock.picking', 'search_read', [[['id', 'in', o.pickings], ['state', 'not in', ['done', 'cancel']]]], { fields: ['name'] })) as { id: number }[]) : [];
  const left = step.lines.slice();
  for (const p of open) {
    for (const line of await loadReceiptLines(c, p.id)) {
      const i = left.findIndex((l) => l.productId === line.productId);
      const came = i >= 0 ? left.splice(i, 1)[0]! : null;
      const qty = came ? came.qty : line.ordered;
      if (qty <= 0) continue;
      await c.call('stock.move', 'write', [[line.moveId], { move_line_ids: [[5, 0, 0], [0, 0, lineValues({ line, qty, lot: came?.lot ?? '', useBy: came?.useBy ?? '' })]] }], {});
    }
    await c.call('stock.picking', 'button_validate', [[p.id]], { context: { skip_backorder: true, skip_sms: true, skip_immediate: true } });
  }
}

/** Makes the vendor bill from the received order, posts it, and registers the payment. Each part is skipped if already done. */
async function bill(c: Client, step: Extract<Step, { kind: 'bill' }>): Promise<void> {
  let o = await orderByToken(c, step.token);
  if (!o) throw new Error('The order for this purchase is not in Odoo yet.');
  if (!o.bills.length) {
    await c.call('purchase.order', 'action_create_invoice', [[o.id]], {});
    o = (await orderByToken(c, step.token))!;
  }
  const bills = o.bills.length ? ((await c.call('account.move', 'read', [o.bills], { fields: ['state', 'payment_state'] })) as { id: number; state?: string; payment_state?: string }[]) : [];
  const b = bills.find((x) => x.state !== 'cancel');
  if (!b) throw new Error('Odoo made no bill for this order. Check the delivery was received.');
  if (b.state === 'draft') {
    await c.call('account.move', 'write', [[b.id], { invoice_date: step.date }], {});
    await c.call('account.move', 'action_post', [[b.id]], {});
  }
  if (step.journalId !== null && b.payment_state !== 'paid' && b.payment_state !== 'in_payment') {
    const wiz = (await c.call('account.payment.register', 'create', [{ journal_id: step.journalId, payment_date: step.date }], { context: { active_model: 'account.move', active_ids: [b.id] } })) as number;
    await c.call('account.payment.register', 'action_create_payments', [[wiz]], { context: { active_model: 'account.move', active_ids: [b.id] } });
  }
}

/** Registers a payment on an existing bill or invoice. Left alone if it is already paid. */
async function pay(c: Client, step: Extract<Step, { kind: 'pay' }>): Promise<void> {
  const [m] = (await c.call('account.move', 'read', [[step.moveId]], { fields: ['state', 'payment_state'] })) as { state?: string; payment_state?: string }[];
  if (!m) throw new Error('That bill or invoice is no longer in Odoo.');
  if (m.payment_state === 'paid' || m.payment_state === 'in_payment') return;
  if (m.state !== 'posted') throw new Error('It is not confirmed in Odoo yet, so it cannot be marked paid. Confirm it in Odoo first.');
  const ctx = { active_model: 'account.move', active_ids: [step.moveId] };
  const wiz = (await c.call('account.payment.register', 'create', [{ journal_id: step.journalId, payment_date: step.date }], { context: ctx })) as number;
  await c.call('account.payment.register', 'action_create_payments', [[wiz]], { context: ctx });
}

/** Pay on delivery: makes the order's invoice if missing, posts it, and registers the payment if a journal was chosen. */
async function runSalePay(c: Client, step: Extract<Step, { kind: 'salepay' }>): Promise<void> {
  await runSaleInvoice(c, step.orderId);
  const [o] = (await c.call('sale.order', 'read', [[step.orderId]], { fields: ['invoice_ids'] })) as { invoice_ids?: number[] }[];
  const ids = o?.invoice_ids ?? [];
  if (!ids.length) throw new Error('Odoo made no invoice for this order.');
  const moves = (await c.call('account.move', 'read', [ids], { fields: ['state', 'payment_state', 'move_type'] })) as { id: number; state: string; payment_state?: string; move_type?: string }[];
  for (const m of moves) {
    if (m.state === 'cancel' || (m.move_type && m.move_type !== 'out_invoice')) continue;
    if (m.state === 'draft') await c.call('account.move', 'action_post', [[m.id]]);
    if (step.journalId) await pay(c, { kind: 'pay', moveId: m.id, date: step.date, journalId: step.journalId });
  }
}

/** Posts a note on the record unless a note with the same tag is already there. */
async function note(c: Client, step: Extract<Step, { kind: 'note' }>): Promise<void> {
  const found = (await c.call('mail.message', 'search', [[['model', '=', step.model], ['res_id', '=', step.resId], ['body', 'ilike', step.tag]]], { limit: 1 })) as number[];
  if (found.length) return;
  await c.call(step.model, 'message_post', [[step.resId]], { body: `${step.body} <small>[${step.tag}]</small>`, message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
}

export async function runStep(c: Client, step: Step): Promise<void> {
  if (step.kind === 'setting') return runSetting(c, step.key, step.value);
  if (step.kind === 'move') return runMove(c, step);
  if (step.kind === 'count') return runCount(c, step);
  if (step.kind === 'saleinvoice') return runSaleInvoice(c, step.orderId);
  if (step.kind === 'salepay') return runSalePay(c, step);
  if (step.kind === 'expense') return runExpense(c, step);
  if (step.kind === 'photo') return runPhoto(c, step);
  if (step.kind === 'note') return note(c, step);
  if (step.kind === 'pay') return pay(c, step);
  if (step.kind === 'receive') return receive(c, step);
  return bill(c, step);
}

