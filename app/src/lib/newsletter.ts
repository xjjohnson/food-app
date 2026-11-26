/**
 * A newsletter, made with Odoo's Email Marketing: pick new products, write a
 * subject and a few words, save it as a draft. Sending is a separate tap that
 * shows how many people it goes to first. Nothing is scheduled and nothing is
 * sent without that tap (rule 4: no automatic messages).
 *
 * Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface MailList {
  id: number;
  name: string;
  count: number;
}

/** The mailing lists Odoo has, with how many people are on each. */
export async function loadLists(c: Client): Promise<MailList[]> {
  const rows = (await c.call('mailing.list', 'search_read', [[]], { fields: ['name', 'contact_count'], order: 'name asc', limit: 30 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), count: Number(r.contact_count ?? 0) }));
}

export interface NewProduct {
  name: string;
  price: number;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The body as simple HTML: the words, then the picked products with Odoo’s list prices. */
export function newsletterBody(words: string, products: NewProduct[]): string {
  const paras = words.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
  const list = products.length ? `<p><b>New for you</b></p><ul>${products.map((p) => `<li>${esc(p.name)}, ${p.price.toFixed(2)}</li>`).join('')}</ul>` : '';
  return `${paras}${list}`;
}

export function newsletterProblems(subject: string, words: string, listIds: number[]): string[] {
  const out: string[] = [];
  if (!subject.trim()) out.push('Write a subject.');
  if (!words.trim()) out.push('Write a few words for the body.');
  if (!listIds.length) out.push('Pick who it goes to.');
  return out;
}

/** Saves a draft in Odoo (not sent). The same subject and body is never made twice. */
export function draftChange(subject: string, body: string, listIds: number[], mailingModelId: number): NewChange {
  return {
    label: `Newsletter draft: ${subject.trim()}`,
    model: 'mailing.mailing',
    method: 'create',
    args: [{ state: 'draft', subject: subject.trim(), body_arch: body, body_html: body, mailing_model_id: mailingModelId, mailing_type: 'mail', contact_list_ids: [[6, 0, listIds]] }],
    already: { model: 'mailing.mailing', domain: [['subject', '=', subject.trim()], ['state', '=', 'draft']] },
  };
}

/** The ir.model that means "send to mailing lists". */
export async function listModelId(c: Client): Promise<number> {
  const [id] = (await c.call('ir.model', 'search', [[['model', '=', 'mailing.list']]], { limit: 1 })) as number[];
  if (!id) throw new Error('This Odoo has no Email Marketing app. Switch it on in Odoo first.');
  return id;
}

export interface Draft {
  id: number;
  subject: string;
  state: string;
  /** How many people it would go to. */
  people: number;
}

export async function loadDrafts(c: Client): Promise<Draft[]> {
  const rows = (await c.call('mailing.mailing', 'search_read', [[['state', 'in', ['draft', 'in_queue', 'sending', 'done']]]], { fields: ['subject', 'state', 'contact_list_ids'], order: 'id desc', limit: 15 })) as Record<string, unknown>[];
  const out: Draft[] = [];
  for (const r of rows.slice().sort((a, b) => (b.id as number) - (a.id as number))) {
    const ids = (r.contact_list_ids as number[]) ?? [];
    const lists = ids.length ? ((await c.call('mailing.list', 'read', [ids], { fields: ['contact_count'] })) as { contact_count?: number }[]) : [];
    out.push({ id: r.id as number, subject: String(r.subject ?? ''), state: String(r.state), people: lists.reduce((n, l) => n + Number(l.contact_count ?? 0), 0) });
  }
  return out;
}

/** Sends a draft through Odoo. Only called from the owner's confirmed tap, with signal. Refuses a draft that was already sent. */
export async function sendNewsletter(c: Client, id: number): Promise<void> {
  const [m] = (await c.call('mailing.mailing', 'read', [[id]], { fields: ['state'] })) as { state?: string }[];
  if (!m) throw new Error('That newsletter is no longer in Odoo.');
  if (m.state !== 'draft') throw new Error('That newsletter was already sent.');
  await c.call('mailing.mailing', 'action_launch', [[id]], {});
}
