/**
 * Making extras: the week view of planned batches (move one to another day),
 * recipe versions, recipe test batches with scores, and events and booths.
 *
 * Batches are normal Odoo manufacturing orders. Scores, bring-lists and event
 * results are kept as lines in the Food app settings contact. The app never
 * picks a recipe for you: "Keep" on a test only opens the new-version step.
 * Kept free of React; the client is passed in.
 */
import { type Settings, settingChange } from './appSettings';
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';
import type { Section } from './odooForm';
import { fromLine, toLine } from './records';

type Client = Pick<OdooClient, 'call'>;

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The seven days starting at `from`, as YYYY-MM-DD. */
export const weekDays = (from = new Date()) => Array.from({ length: 7 }, (_, i) => day(new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)));

export interface WeekBatch {
  id: number;
  name: string;
  product: string;
  qty: number;
  state: string;
  day: string;
}

/** Planned and open batches for the week. A batch with no day is left out. */
export async function loadWeek(c: Client, from = new Date()): Promise<WeekBatch[]> {
  const days = weekDays(from);
  const rows = (await c.call('mrp.production', 'search_read', [[['state', 'in', ['draft', 'confirmed', 'progress']], ['date_start', '>=', `${days[0]} 00:00:00`], ['date_start', '<=', `${days[6]} 23:59:59`]]], { fields: ['name', 'product_id', 'product_qty', 'state', 'date_start'], limit: 100 })) as Record<string, unknown>[];
  return rows
    .map((r) => ({
      id: r.id as number,
      name: String(r.name ?? ''),
      product: Array.isArray(r.product_id) ? String(r.product_id[1] ?? '') : '',
      qty: Number(r.product_qty ?? 0),
      state: String(r.state ?? ''),
      day: String(r.date_start ?? '').slice(0, 10),
    }))
    .sort((a, z) => a.day.localeCompare(z.day) || a.id - z.id);
}

/** Moves a batch to another day. Noon, so a time zone can't push it to the next day. */
export const moveBatchChange = (b: Pick<WeekBatch, 'id' | 'product'>, to: string): NewChange => ({
  label: `Move ${b.product} batch to ${to}`,
  model: 'mrp.production',
  method: 'write',
  args: [[b.id], { date_start: `${to} 12:00:00` }],
});

// ---- Recipe versions ----

/** "Grape jelly v2" after "Grape jelly" or "Grape jelly v1". */
export function nextVersionCode(code: string, name: string): string {
  const base = (code || name).trim();
  const m = /^(.*?)\s*v(\d+)$/i.exec(base);
  return m ? `${m[1]} v${Number(m[2]) + 1}` : `${base} v2`;
}

export const versionTag = (oldId: number, code: string) => `food-app-version-${oldId}-${code.replace(/[^a-z0-9]/gi, '')}`;

/**
 * Save as new version: copy the recipe under a new reference, note why on the
 * old one, then archive the old one. Three changes in order; batches already
 * started keep what they had.
 */
export function versionChanges(r: { id: number; code: string; name: string }, reason: string, newCode = nextVersionCode(r.code, r.name)): NewChange[] {
  const why = reason.trim().replace(/[<&]/g, ' ');
  return [
    { label: `New version of ${r.name}: ${newCode}`, model: 'mrp.bom', method: 'copy', args: [[r.id], { code: newCode }], already: { model: 'mrp.bom', domain: [['code', '=', newCode]] } },
    { label: `Note why: ${r.name}`, model: 'mrp.bom', method: 'message_post', args: [], step: { kind: 'note', model: 'mrp.bom', resId: r.id, tag: versionTag(r.id, newCode), body: `Replaced by ${newCode}.${why ? ` Why: ${why}` : ''}` } },
    { label: `Archive the old ${r.name} recipe`, model: 'mrp.bom', method: 'write', args: [[r.id], { active: false }] },
  ];
}

export interface Version {
  id: number;
  code: string;
  active: boolean;
}

/** Every version of a product's recipe, newest first, including archived ones. */
export async function loadVersions(c: Client, templateId: number): Promise<Version[]> {
  const rows = (await c.call('mrp.bom', 'search_read', [[['product_tmpl_id', '=', templateId], ['type', '=', 'normal']]], { fields: ['code', 'active'], context: { active_test: false } })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, code: typeof r.code === 'string' ? r.code : '', active: r.active !== false })).sort((a, z) => z.id - a.id);
}

// ---- Recipe tests ----

export interface TestBatch {
  key: string;
  recipeId: number;
  recipe: string;
  change: string;
  qty: number;
  taste: number;
  texture: number;
  set: number;
  notes: string;
  /** '' not decided, 'keep' or 'drop'. */
  verdict: '' | 'keep' | 'drop';
}

export const testKey = (stamp: string) => `test.${stamp}`;

const cell = (t: string) => toLine(t).replace(/\|/g, '¦');
const score = (n: number) => Math.min(5, Math.max(0, Math.round(n) || 0));

export function testToLine(t: TestBatch): string {
  return [t.recipeId, cell(t.recipe), cell(t.change), t.qty, score(t.taste), score(t.texture), score(t.set), cell(t.notes), t.verdict].join('|');
}

export function testFromLine(key: string, line: string | undefined): TestBatch | null {
  const p = (line ?? '').split('|');
  if (p.length < 9) return null;
  return { key, recipeId: Number(p[0]) || 0, recipe: fromLine(p[1]), change: fromLine(p[2]), qty: Number(p[3]) || 0, taste: score(Number(p[4])), texture: score(Number(p[5])), set: score(Number(p[6])), notes: fromLine(p[7]), verdict: p[8] === 'keep' || p[8] === 'drop' ? p[8] : '' };
}

export const loadTests = (s: Settings): TestBatch[] =>
  Object.entries(s)
    .filter(([k]) => k.startsWith('test.'))
    .flatMap(([k, v]) => {
      const t = testFromLine(k, v);
      return t ? [t] : [];
    })
    .sort((a, z) => z.key.localeCompare(a.key));

export const saveTestChange = (t: TestBatch) => settingChange(t.key, testToLine(t));

/** A small draft batch for the test. Not confirmed, so no ingredients are set aside. */
export function testBatchChange(r: { id: number; productId: number; name: string }, qty: number, stamp: string): NewChange {
  const token = `food-app-test-${stamp}`;
  return {
    label: `Test batch: ${qty} ${r.name}`,
    model: 'mrp.production',
    method: 'create',
    args: [{ product_id: r.productId, product_qty: qty, bom_id: r.id, origin: token }],
    already: { model: 'mrp.production', domain: [['origin', '=', token]] },
  };
}

// ---- Events and booths ----

export const EVENT_SECTIONS: Section[] = [
  {
    id: 'main',
    title: 'Event or booth',
    fields: [
      { name: 'name', label: 'Name', kind: 'text' },
      { name: 'date_begin', label: 'Starts (year-month-day)', kind: 'date' },
      { name: 'date_end', label: 'Ends (year-month-day)', kind: 'date' },
      { name: 'address_id', label: 'Place', kind: 'one', relation: 'res.partner' },
      { name: 'user_id', label: 'Who is in charge', kind: 'one', relation: 'res.users' },
      { name: 'seats_max', label: 'Most people (0 for no limit)', kind: 'whole' },
    ],
  },
];

export interface EventRow {
  id: number;
  name: string;
  start: string;
  place: string;
}

export async function loadEvents(c: Client): Promise<EventRow[]> {
  const rows = (await c.call('event.event', 'search_read', [[]], { fields: ['name', 'date_begin', 'address_id'], limit: 60 })) as Record<string, unknown>[];
  return rows
    .map((r) => ({ id: r.id as number, name: String(r.name ?? ''), start: String(r.date_begin ?? '').slice(0, 10), place: Array.isArray(r.address_id) ? String(r.address_id[1] ?? '') : '' }))
    .sort((a, z) => z.start.localeCompare(a.start));
}

export const bringKey = (eventId: number) => `event.${eventId}.bring`;
export const resultsKey = (eventId: number) => `event.${eventId}.results`;
export const bringList = (s: Settings, id: number) => fromLine(s[bringKey(id)]).split('\n').map((l) => l.trim()).filter(Boolean);
