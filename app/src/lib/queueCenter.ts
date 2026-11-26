/**
 * Words for the Waiting screen (the queue center): what each waiting change
 * does step by step, which database it is for, and why Odoo refused it, in
 * plain language. Reads the queue only; nothing here sends or changes.
 */
import type { QueuedChange } from './queue';

const STEP_WORDS: Record<string, string> = {
  receive: 'Receive the delivery',
  bill: 'Make the bill',
  expense: 'Save the expense',
  saleinvoice: 'Make the invoice',
  setting: 'Save the app setting',
  photo: 'Attach the photo',
  note: 'Add a note',
  move: 'Move the stock',
  count: 'Save the count',
  pay: 'Record the payment',
  salepay: 'Make the invoice and record the payment',
};

/** The steps a waiting change will take, in order. */
export function stepsOf(x: QueuedChange): string[] {
  const out: string[] = [];
  if (x.step) out.push(STEP_WORDS[x.step.kind] ?? 'Save it');
  else out.push(x.method === 'create' ? 'Make the record' : x.method === 'write' ? 'Change the record' : 'Save it');
  if (x.then) out.push('Then finish it in Odoo');
  return out;
}

/** The database name, without the address: "food-test". */
export const dbName = (db: string) => db.split('|')[1] ?? db;

/** Odoo's reason in plain words, with the exact text kept after it. */
export function plainReason(error: string | undefined): string {
  const e = (error ?? '').trim();
  if (!e) return 'Odoo gave no reason.';
  const l = e.toLowerCase();
  if (l.includes('access') || l.includes('not allowed') || l.includes('permission')) return `You don’t have permission for this in Odoo. Ask the owner to check your rights. (${e})`;
  if (l.includes('does not exist') || l.includes('missing record') || l.includes('has been deleted')) return `Something it needs was deleted in Odoo. (${e})`;
  if (l.includes('required') || l.includes('mandatory')) return `Odoo needs one more thing filled in. (${e})`;
  if (l.includes('unique') || l.includes('already exists') || l.includes('duplicate')) return `Odoo already has one like it. (${e})`;
  if (l.includes('not enough') || l.includes('insufficient') || l.includes('quantity')) return `There isn’t enough stock for this. (${e})`;
  return e;
}
