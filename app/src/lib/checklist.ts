/**
 * The batch checklist: steps to tick on a batch (wash jars, cook, fill, seal,
 * cool, label). The step names come from an Odoo Survey whose title starts
 * with "Batch checklist" (its questions are the steps), the way the garage
 * door app uses Surveys; with no such survey a plain default list is used.
 * Each tick is a note on the batch in Odoo (who and when), posted once.
 */
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export const DEFAULT_STEPS = ['Wash and dry the jars', 'Weigh the ingredients', 'Cook', 'Fill the jars', 'Seal and cool', 'Label'];

export interface StepRow {
  index: number;
  name: string;
  done: boolean;
  by: string;
}

const tagFor = (batchId: number, index: number) => `food-app-step-${batchId}-${index}`;

/** The steps: survey questions when a "Batch checklist" survey exists, otherwise the default list. */
export async function loadSteps(c: Client): Promise<string[]> {
  try {
    const [s] = (await c.call('survey.survey', 'search_read', [[['title', 'ilike', 'Batch checklist']]], { fields: ['title'], limit: 1 })) as { id: number }[];
    if (!s) return DEFAULT_STEPS;
    const qs = (await c.call('survey.question', 'search_read', [[['survey_id', '=', s.id], ['is_page', '=', false]]], { fields: ['title', 'sequence'], order: 'sequence asc, id asc' })) as { title?: string }[];
    const names = qs.map((q) => String(q.title ?? '').trim()).filter(Boolean);
    return names.length ? names : DEFAULT_STEPS;
  } catch {
    return DEFAULT_STEPS;
  }
}

/** Which steps are ticked on this batch, from the notes in Odoo. */
export async function loadTicks(c: Client, batchId: number, steps: string[]): Promise<StepRow[]> {
  const notes = (await c.call('mail.message', 'search_read', [[['model', '=', 'mrp.production'], ['res_id', '=', batchId], ['body', 'ilike', `food-app-step-${batchId}-`]]], { fields: ['body', 'author_id'] })) as { body?: string; author_id?: unknown }[];
  return steps.map((name, index) => {
    const n = notes.find((m) => String(m.body ?? '').includes(`[${tagFor(batchId, index)}]`));
    return { index, name, done: !!n, by: n && Array.isArray(n.author_id) ? String(n.author_id[1] ?? '') : '' };
  });
}

/** Ticks one step. Posted once even if sent twice. */
export function tickChange(batchId: number, batchName: string, index: number, name: string): NewChange {
  return {
    label: `${batchName}: ${name}`,
    model: 'mrp.production',
    method: 'message_post',
    args: [],
    step: { kind: 'note', model: 'mrp.production', resId: batchId, tag: tagFor(batchId, index), body: `Step done: ${name}` },
  };
}

