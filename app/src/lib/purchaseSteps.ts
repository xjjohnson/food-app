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

export async function runStep(c: Client, step: Step): Promise<void> {
  if (step.kind === 'receive') return receive(c, step);
  return bill(c, step);
}

