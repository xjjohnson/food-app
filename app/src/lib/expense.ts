/**
 * Expenses: money spent that is not a purchase order (a market fee, jar lids
 * from a shop, gas). Odoo's Expenses app is not needed: the app makes a
 * vendor bill in Odoo with one line, posts it, optionally marks it paid, and
 * keeps the receipt photo on it. It runs from the offline queue as one step
 * and is safe to run twice: the bill is found again by its token.
 *
 * Nothing is worked out here: the amount typed is the line's price, and Odoo
 * does everything else.
 *
 * Kept free of React; the client is passed in.
 */
import { dropPhoto } from './photoFiles';
import { runPhoto } from './photos';
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface ExpenseInput {
  what: string;
  store: string;
  /** "YYYY-MM-DD". */
  date: string;
  amount: number;
  accountId: number;
  /** The payment journal (Cash, Bank...), or null for "not paid yet". */
  journalId: number | null;
  /** The receipt picture waiting on the phone, if any. */
  uri: string | null;
}

export interface ExpenseStep extends ExpenseInput {
  kind: 'expense';
  token: string;
}

/** The expense accounts a bill line can use. Empty when there is no Accounting app. */
export async function loadExpenseAccounts(c: Client): Promise<{ id: number; name: string }[]> {
  try {
    const rows = (await c.call('account.account', 'search_read', [[['account_type', 'in', ['expense', 'expense_direct_cost']]]], { fields: ['code', 'name'], order: 'code asc, id asc', limit: 80 })) as { id: number; code?: string; name: string }[];
    return rows.map((r) => ({ id: r.id, name: `${r.code ? `${r.code} ` : ''}${r.name}`.trim() }));
  } catch {
    return [];
  }
}

export function expenseProblems(e: Partial<ExpenseInput> & { amountText: string }): string[] {
  const out: string[] = [];
  if (!e.what?.trim()) out.push('Say what it was for.');
  if (!(Number(e.amountText.replace(',', '.')) > 0)) out.push('Type the amount.');
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) out.push('Use the date form 2026-11-26.');
  if (!e.accountId) out.push('Pick a category.');
  return out;
}

export function expenseChange(input: ExpenseInput, now = Date.now()): NewChange {
  const token = `food-app-exp-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Expense ${input.what.trim()} ${input.amount.toFixed(2)}`,
    model: 'account.move',
    method: 'create',
    args: [],
    step: { kind: 'expense', token, ...input, what: input.what.trim(), store: input.store.trim() },
  };
}

export async function runExpense(c: Client, s: ExpenseStep): Promise<void> {
  let [m] = (await c.call('account.move', 'search_read', [[['invoice_origin', '=', s.token], ['move_type', '=', 'in_invoice']]], { fields: ['state', 'payment_state'], limit: 1 })) as { id: number; state?: string; payment_state?: string }[];
  if (!m) {
    let partner: number | false = false;
    if (s.store) {
      const [p] = (await c.call('res.partner', 'search_read', [[['name', '=', s.store]]], { fields: ['name'], limit: 1 })) as { id: number }[];
      partner = p ? p.id : ((await c.call('res.partner', 'create', [{ name: s.store }], {})) as number);
    }
    const id = (await c.call('account.move', 'create', [{ move_type: 'in_invoice', partner_id: partner, invoice_date: s.date, ref: s.store || s.what, invoice_origin: s.token, invoice_line_ids: [[0, 0, { name: s.what, quantity: 1, price_unit: s.amount, account_id: s.accountId }]] }], {})) as number;
    m = { id, state: 'draft' };
  }
  if (m.state === 'draft') {
    await c.call('account.move', 'action_post', [[m.id]], {});
    m.state = 'posted';
  }
  if (s.journalId !== null && m.payment_state !== 'paid' && m.payment_state !== 'in_payment') {
    const ctx = { active_model: 'account.move', active_ids: [m.id] };
    const wiz = (await c.call('account.payment.register', 'create', [{ journal_id: s.journalId, payment_date: s.date }], { context: ctx })) as number;
    await c.call('account.payment.register', 'action_create_payments', [[wiz]], { context: ctx });
  }
  if (s.uri) await runPhoto(c, { model: 'account.move', resId: m.id, name: `Receipt ${s.token}.jpg`, uri: s.uri });
}

/** Cleans up the picture when an expense is thrown away before it was sent. */
export const dropReceipt = (uri: string | null) => (uri ? dropPhoto(uri) : Promise.resolve());
