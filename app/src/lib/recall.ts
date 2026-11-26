/**
 * Recall: for one batch number, everything it touched. Where it was made, which finished
 * batches it went into, and which customers got it, directly or inside a finished batch.
 * The result also becomes a plain-text traceability sheet to share (message, email, print).
 *
 * Reads only. Kept free of React; the client is passed in.
 */
import { BatchTrace, traceLot } from './stock';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface Recall {
  trace: BatchTrace;
  /** Finished batches this batch went into, with the customers each one reached. */
  finished: { batch: string; product: string; lots: string[]; customers: BatchTrace['wentOutOn'] }[];
  /** Everyone who may have received it, once each. */
  customers: string[];
}

export async function recallLot(c: Client, lotId: number): Promise<Recall | null> {
  const trace = await traceLot(c, lotId);
  if (!trace) return null;
  const finished: Recall['finished'] = [];
  for (const u of trace.usedIn) {
    const [mo] = (await c.call('mrp.production', 'read', [[u.id]], { fields: ['lot_producing_ids'] })) as { lot_producing_ids?: number[] }[];
    const lotIds = mo?.lot_producing_ids ?? [];
    const lots: string[] = [];
    const customers: BatchTrace['wentOutOn'] = [];
    for (const id of lotIds) {
      const t = await traceLot(c, id);
      if (!t) continue;
      lots.push(t.lot.name);
      customers.push(...t.wentOutOn);
    }
    finished.push({ batch: u.name, product: u.product, lots, customers });
  }
  const names = [...trace.wentOutOn, ...finished.flatMap((f) => f.customers)].map((o) => o.customer || o.origin || o.name);
  return { trace, finished, customers: [...new Set(names)].sort() };
}

/** The sheet as plain text, ready to share. */
export function recallText(r: Recall, today: string): string {
  const t = r.trace;
  const out = [`Traceability sheet, ${today}`, '', `Batch ${t.lot.name}: ${t.lot.product}`, t.lot.useBy ? `Use by ${t.lot.useBy}` : 'No use-by date', `On hand now: ${t.lot.onHand}`, ''];
  out.push('Made in:');
  if (t.madeIn.length) {
    for (const m of t.madeIn) {
      out.push(`  ${m.name}`);
      for (const i of m.ingredients) out.push(`    ${i.product}, batch ${i.lot}`);
    }
  } else out.push('  Not made here (a bought ingredient).');
  out.push('', 'Went into:');
  if (r.finished.length) for (const f of r.finished) out.push(`  ${f.batch} ${f.product}${f.lots.length ? ` (batch ${f.lots.join(', ')})` : ''}`);
  else out.push('  No finished batch.');
  out.push('', 'Sent to customers:');
  const direct = t.wentOutOn.map((o) => `  ${o.customer || 'Unknown'}, ${o.origin || o.name}, ${o.qty}`);
  const via = r.finished.flatMap((f) => f.customers.map((o) => `  ${o.customer || 'Unknown'}, ${o.origin || o.name}, ${o.qty} (in ${f.product})`));
  out.push(...(direct.length || via.length ? [...direct, ...via] : ['  No one yet.']));
  return out.join('\n');
}
