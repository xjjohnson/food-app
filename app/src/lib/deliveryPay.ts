/**
 * Pay on delivery. When a stop is marked Delivered the app makes the Odoo
 * invoice for the order, and offers Odoo's own payment accounts (Cash, Bank,
 * and so on) or Not paid yet. The amounts and tax are Odoo's; the app only
 * picks the account and says it was paid.
 */
import type { Journal } from './ingredients';
import type { NewChange } from './queue';

export interface PayMethod {
  key: string;
  label: string;
  journal: Journal;
}

/** Every cash and bank account Odoo has, as a button each: the same list "Bought ingredients" shows. */
export function payMethods(journals: Journal[]): PayMethod[] {
  return journals.map((j) => ({ key: `j${j.id}`, label: j.name, journal: j }));
}

/** Makes the invoice for the order (if there is none) and posts it. With a journal, it also marks it paid. Safe to send twice. */
export function salePayChange(orderId: number, name: string, journalId: number | null, journalName: string, date: string): NewChange {
  return {
    label: journalId ? `Invoice and payment for ${name} (${journalName})` : `Invoice for ${name}`,
    model: 'sale.order',
    method: 'action_confirm',
    args: [],
    step: { kind: 'salepay', orderId, date, journalId },
  };
}
