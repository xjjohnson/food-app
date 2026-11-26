/**
 * Pay on delivery. When a stop is marked Delivered the app makes the Odoo
 * invoice for the order, and offers Cash, Cash App, Venmo or Not paid yet.
 * The amounts and tax are Odoo's; the app only picks the payment method
 * (one of Odoo's own journals) and says it was paid.
 */
import type { Journal } from './ingredients';
import type { NewChange } from './queue';

export interface PayMethod {
  key: string;
  label: string;
  journal: Journal;
}

/**
 * Cash, Cash App and Venmo as separate buttons when Odoo has a journal for
 * each. If Cash App and Venmo share one journal, one combined button.
 */
export function payMethods(journals: Journal[]): PayMethod[] {
  const out: PayMethod[] = [];
  const cashApp = journals.find((j) => /cash\s*app/i.test(j.name));
  const venmo = journals.find((j) => /venmo/i.test(j.name));
  const cash = journals.find((j) => /cash/i.test(j.name) && !/cash\s*app/i.test(j.name) && !/venmo/i.test(j.name));
  if (cash) out.push({ key: 'cash', label: 'Cash', journal: cash });
  if (cashApp) out.push({ key: 'cashapp', label: 'Cash App', journal: cashApp });
  if (venmo && venmo.id !== cashApp?.id) out.push({ key: 'venmo', label: 'Venmo', journal: venmo });
  else if (venmo && cashApp && venmo.id === cashApp.id) out[out.length - 1] = { key: 'cashapp', label: 'Cash App / Venmo', journal: cashApp };
  else if (venmo) out.push({ key: 'venmo', label: 'Venmo', journal: venmo });
  return out;
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
