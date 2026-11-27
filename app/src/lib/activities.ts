/**
 * Staff tasks, thank-you reminders and special dates, all kept as Odoo
 * activities (the clock icon in the chatter). Reminders go to people inside
 * the app only; nothing is texted. The Project app is not needed.
 *
 * A task has to hang on a record in Odoo. When the owner links none, it hangs
 * on the "Food app settings" contact. A person with no Odoo login can't own an
 * activity, so a task for them goes to the owner.
 *
 * Kept free of React; the client is passed in.
 */
import { SETTINGS_NAME } from './appSettings';
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call' | 'session'>;

export interface Task {
  id: number;
  title: string;
  due: string;
  who: string;
  whoId: number;
  note: string;
  model: string;
  resId: number;
  overdue: boolean;
}

export interface Assignee {
  /** Odoo user id. */
  userId: number;
  name: string;
}

const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '');
const today = () => new Date().toISOString().slice(0, 10);
export const validDate = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t.trim()) && !Number.isNaN(Date.parse(t.trim()));

/** People who can be given a task: Employees with an Odoo login. Others are skipped (their tasks go to the owner). */
export async function loadAssignees(c: Client): Promise<Assignee[]> {
  const rows = (await c.call('hr.employee', 'search_read', [[['user_id', '!=', false]]], { fields: ['name', 'user_id'] })) as { name: string; user_id: unknown }[];
  return rows.map((r) => ({ userId: m2oId(r.user_id), name: r.name })).filter((a) => a.userId);
}

async function settingsPartner(c: Client): Promise<number> {
  const [p] = (await c.call('res.partner', 'search_read', [[['name', '=', SETTINGS_NAME]]], { fields: ['id'], limit: 1 })) as { id: number }[];
  return p?.id ?? 0;
}

/** Looks a typed batch or order name up, so a task can point at it. */
export async function findLink(c: Client, name: string): Promise<{ model: string; id: number; name: string } | null> {
  const t = name.trim();
  if (!t) return null;
  for (const model of ['mrp.production', 'sale.order']) {
    const [r] = (await c.call(model, 'search_read', [[['name', '=', t]]], { fields: ['name'], limit: 1 })) as { id: number; name: string }[];
    if (r) return { model, id: r.id, name: r.name };
  }
  return null;
}

export interface TaskInput {
  title: string;
  due: string;
  /** Odoo user id, or 0 for the owner (the person making it). */
  userId: number;
  note?: string;
  link?: { model: string; id: number } | null;
  /** The record the task hangs on when nothing is linked (the settings contact). */
  fallbackId: number;
}

export function taskProblems(t: Pick<TaskInput, 'title' | 'due'>): string[] {
  const out: string[] = [];
  if (!t.title.trim()) out.push('Write what the task is.');
  if (!validDate(t.due)) out.push('Type the due date like 2026-12-05.');
  return out;
}

export function taskChange(t: TaskInput, myUserId: number): NewChange {
  const link = t.link ?? { model: 'res.partner', id: t.fallbackId };
  const vals = { res_model: link.model, res_id: link.id, summary: t.title.trim(), note: t.note?.trim() || false, date_deadline: t.due.trim(), user_id: t.userId || myUserId };
  return {
    label: `Task: ${t.title.trim()}`,
    model: 'mail.activity',
    method: 'create',
    args: [vals],
    already: { model: 'mail.activity', domain: [['res_model', '=', link.model], ['res_id', '=', link.id], ['summary', '=', vals.summary], ['date_deadline', '=', vals.date_deadline], ['user_id', '=', vals.user_id]] },
  };
}

export const loadFallbackId = settingsPartner;

/** Open tasks, soonest first. The owner sees everyone's; others see their own. */
export async function loadTasks(c: Client, all: boolean): Promise<Task[]> {
  const domain: unknown[] = all ? [] : [['user_id', '=', c.session.uid]];
  const rows = (await c.call('mail.activity', 'search_read', [domain], { fields: ['summary', 'note', 'date_deadline', 'user_id', 'res_model', 'res_id'] })) as Record<string, unknown>[];
  const t = today();
  return rows
    .map((r) => ({
      id: r.id as number,
      title: String(r.summary || strip(r.note) || 'Task'),
      due: String(r.date_deadline || ''),
      who: Array.isArray(r.user_id) ? String(r.user_id[1] ?? '') : '',
      whoId: m2oId(r.user_id),
      note: strip(r.note),
      model: String(r.res_model || ''),
      resId: Number(r.res_id) || 0,
      overdue: !!r.date_deadline && String(r.date_deadline) < t,
    }))
    .sort((a, z) => a.due.localeCompare(z.due));
}

/** Ticks a task done (Odoo's own Mark Done). */
export const doneChange = (task: Pick<Task, 'id' | 'title'>): NewChange => ({
  label: `Task done: ${task.title}`,
  model: 'mail.activity',
  method: 'action_feedback',
  args: [[task.id]],
  kwargs: { feedback: 'Done in the food app' },
});

/** A reminder to write a thank-you note by hand, made when an order is delivered. Once per order. */
export function thankYouChange(o: { partnerId: number; customer: string; saleName: string }, userId: number, due = today()): NewChange {
  const summary = `Write a thank-you note to ${o.customer} (${o.saleName})`;
  return {
    label: `Thank-you reminder: ${o.customer}`,
    model: 'mail.activity',
    method: 'create',
    args: [{ res_model: 'res.partner', res_id: o.partnerId, summary, date_deadline: due, user_id: userId }],
    already: { model: 'mail.activity', domain: [['res_model', '=', 'res.partner'], ['res_id', '=', o.partnerId], ['summary', '=', summary]] },
  };
}

export const SPECIAL_KINDS = ['Birthday', 'Order anniversary'] as const;

/** The next time a month-day comes round (on or after `now`), as YYYY-MM-DD. */
export function nextOccurrence(md: string, now = new Date()): string {
  const [m, d] = md.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');
  const thisYear = `${now.getFullYear()}-${pad(m)}-${pad(d)}`;
  return thisYear >= `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` ? thisYear : `${now.getFullYear() + 1}-${pad(m)}-${pad(d)}`;
}

/** A special date on a customer: a To-Do on the contact for the next time it comes round. Reminds you only. */
export function specialDateChange(p: { partnerId: number; name: string; kind: string; md: string }, userId: number, now = new Date()): NewChange {
  const summary = `${p.kind}: ${p.name}`;
  const due = nextOccurrence(p.md, now);
  return {
    label: `${p.kind} reminder: ${p.name}`,
    model: 'mail.activity',
    method: 'create',
    args: [{ res_model: 'res.partner', res_id: p.partnerId, summary, date_deadline: due, user_id: userId }],
    already: { model: 'mail.activity', domain: [['res_model', '=', 'res.partner'], ['res_id', '=', p.partnerId], ['summary', '=', summary], ['date_deadline', '=', due]] },
  };
}

export const isSpecial = (summary: string) => SPECIAL_KINDS.some((k) => summary.startsWith(`${k}:`));

/** Special dates in the next `days` days, for Today. */
export async function countSpecialSoon(c: Client, days = 7, now = new Date()): Promise<number> {
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const rows = (await c.call('mail.activity', 'search_read', [[['date_deadline', '>=', from], ['date_deadline', '<=', to]]], { fields: ['summary'] })) as { summary?: string }[];
  return rows.filter((r) => isSpecial(String(r.summary ?? ''))).length;
}

/** Tasks due today or late for this person. */
export async function countMyTasks(c: Client): Promise<number> {
  return (await loadTasks(c, false)).filter((t) => t.due <= today()).length;
}

export interface HistoryLine {
  id: number;
  date: string;
  who: string;
  text: string;
}

/** Who changed what and when, from the record's chatter (messages and tracked changes). */
export async function loadHistory(c: Client, model: string, resId: number): Promise<HistoryLine[]> {
  const msgs = (await c.call('mail.message', 'search_read', [[['model', '=', model], ['res_id', '=', resId]]], { fields: ['date', 'author_id', 'body', 'tracking_value_ids'], limit: 50 })) as Record<string, unknown>[];
  const ids = msgs.flatMap((m) => (Array.isArray(m.tracking_value_ids) ? (m.tracking_value_ids as number[]) : []));
  let tracks: Record<string, unknown>[] = [];
  if (ids.length) {
    try {
      tracks = (await c.call('mail.tracking.value', 'read', [ids], { fields: ['field_id', 'old_value_char', 'new_value_char', 'old_value_float', 'new_value_float', 'old_value_integer', 'new_value_integer', 'mail_message_id'] })) as Record<string, unknown>[];
    } catch {
      tracks = [];
    }
  }
  const field = (t: Record<string, unknown>) => (Array.isArray(t.field_id) ? String(t.field_id[1] ?? '') : String(t.field_id ?? ''));
  return msgs
    .map((m) => {
      const mine = tracks.filter((t) => (Array.isArray(t.mail_message_id) ? t.mail_message_id[0] : t.mail_message_id) === m.id);
      // Skip changes where nothing really changed (Odoo re-counts totals and tracks them as empty to empty).
      const val = (t: Record<string, unknown>, w: 'old' | 'new') => {
        const c = t[`${w}_value_char`];
        if (c) return String(c);
        const f = t[`${w}_value_float`];
        if (typeof f === 'number' && f !== 0) return String(f);
        const i = t[`${w}_value_integer`];
        if (typeof i === 'number' && i !== 0) return String(i);
        return '';
      };
      const changes = mine.filter((t) => val(t, 'old') !== val(t, 'new')).map((t) => `${field(t)}: ${val(t, 'old') || 'empty'} → ${val(t, 'new') || 'empty'}`);
      const text = changes.length ? changes.join('; ') : strip(m.body);
      return { id: m.id as number, date: String(m.date || ''), who: Array.isArray(m.author_id) ? String(m.author_id[1] ?? '') : '', text };
    })
    .filter((l) => l.text)
    .sort((a, z) => z.date.localeCompare(a.date));
}
