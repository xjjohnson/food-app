/**
 * A form that mirrors a screen of Odoo, driven by a list of fields. Which
 * fields exist is asked of Odoo (`fields_get`), so a field this Odoo doesn't
 * have (or an app that isn't installed) is simply left out.
 *
 * `formChanges` compares the draft with what Odoo had and returns one write
 * of only what changed. The app never works out prices, taxes or costs: a
 * number is saved as typed and a tax is only picked from Odoo's list.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface Rel {
  id: number;
  name: string;
}

export type Val = boolean | string | Rel | null | Rel[];

export type Kind = 'bool' | 'text' | 'long' | 'num' | 'whole' | 'select' | 'one' | 'many' | 'html' | 'date';

export interface FieldDef {
  name: string;
  label: string;
  kind: Kind;
  /** For 'one' and 'many': the Odoo model to pick from. */
  relation?: string;
  /** For 'select'. */
  options?: { id: string; label: string }[];
  /** Shown on screen under the field. */
  hint?: string;
  /** Only shown when this bool field is on in the draft. */
  showWhen?: string;
  /** Shown but not changed from the app. */
  readOnly?: boolean;
  /** Can be set when adding, but not changed after. */
  createOnly?: boolean;
  /** Domain for picking, for 'one' and 'many'. */
  domain?: unknown[];
}

export interface Section {
  id: string;
  title: string;
  fields: FieldDef[];
}

export type Draft = Record<string, Val>;

const nameOf = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');

/** The fields of `model` that this Odoo has. */
export async function presentFields(c: Client, model: string): Promise<Set<string>> {
  const f = (await c.call(model, 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  return new Set(Object.keys(f));
}

/** Sections with only the fields Odoo has; empty sections are dropped. */
export function onlyPresent(sections: Section[], have: Set<string>): Section[] {
  return sections.map((s) => ({ ...s, fields: s.fields.filter((f) => have.has(f.name)) })).filter((s) => s.fields.length);
}

export const allFields = (sections: Section[]) => sections.flatMap((s) => s.fields);

const strip = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (t: string) =>
  t
    .trim()
    .split(/\n+/)
    .map((l) => `<p>${esc(l)}</p>`)
    .join('');

/** An empty value for a field. */
export function blankValue(f: FieldDef): Val {
  if (f.kind === 'bool') return false;
  if (f.kind === 'one') return null;
  if (f.kind === 'many') return [];
  return '';
}

export async function relNames(c: Client, relation: string, ids: number[]): Promise<Rel[]> {
  if (!ids.length) return [];
  const rows = (await c.call(relation, 'read', [ids], { fields: ['display_name', 'name'] })) as Record<string, unknown>[];
  return ids.map((id) => {
    const r = rows.find((x) => x.id === id);
    return { id, name: String(r?.display_name || r?.name || `#${id}`) };
  });
}

/** Reads the record and turns each field into a draft value. */
export async function loadDraft(c: Client, model: string, id: number, defs: FieldDef[]): Promise<Draft> {
  const [r] = (await c.call(model, 'read', [[id]], { fields: defs.map((d) => d.name) })) as Record<string, unknown>[];
  const out: Draft = {};
  for (const d of defs) {
    const v = r?.[d.name];
    if (d.kind === 'bool') out[d.name] = v === true;
    else if (d.kind === 'one') out[d.name] = m2oId(v) ? { id: m2oId(v), name: nameOf(v) } : null;
    else if (d.kind === 'many') out[d.name] = await relNames(c, d.relation!, Array.isArray(v) ? (v as number[]) : []);
    else if (d.kind === 'html') out[d.name] = typeof v === 'string' ? strip(v) : '';
    else if (d.kind === 'date') out[d.name] = typeof v === 'string' ? v.slice(0, 10) : '';
    else if (d.kind === 'num' || d.kind === 'whole') out[d.name] = v === false || v === undefined || v === null ? '' : String(v);
    else out[d.name] = typeof v === 'string' ? v : '';
  }
  return out;
}

/** Finds records to pick, by name. */
export async function searchRelation(c: Client, relation: string, text: string, domain: unknown[] = []): Promise<Rel[]> {
  const rows = (await c.call(relation, 'name_search', [], { name: text.trim(), args: domain, limit: 30 })) as [number, string][];
  return rows.map(([id, name]) => ({ id, name }));
}

const same = (a: Val | undefined, b: Val | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const numOf = (t: string) => Number(t.replace(',', '.'));

/** The value to send to Odoo for a field, or undefined when the field isn't sent. */
function sendValue(d: FieldDef, v: Val): unknown {
  switch (d.kind) {
    case 'bool':
      return v === true;
    case 'one':
      return v && !Array.isArray(v) && typeof v === 'object' ? v.id : false;
    case 'many':
      return [[6, 0, (v as Rel[]).map((x) => x.id)]];
    case 'num':
    case 'whole':
      return String(v).trim() === '' ? 0 : numOf(String(v));
    case 'html':
      return String(v).trim() ? toHtml(String(v)) : false;
    case 'select':
      return String(v);
    case 'date':
      return String(v).trim() ? `${String(v).trim()} 12:00:00` : false;
    default:
      return String(v).trim() || false;
  }
}

/** The fields that differ, ready to write. */
export function changedValues(defs: FieldDef[], before: Draft, draft: Draft, creating = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    if (d.readOnly || (d.createOnly && !creating)) continue;
    if (same(before[d.name], draft[d.name])) continue;
    out[d.name] = sendValue(d, draft[d.name]!);
  }
  return out;
}

export function formChanges(model: string, id: number, label: string, defs: FieldDef[], before: Draft, draft: Draft): NewChange[] {
  const vals = changedValues(defs, before, draft);
  return Object.keys(vals).length ? [{ label, model, method: 'write', args: [[id], vals] }] : [];
}

/** Problems that stop a save, in plain words. */
export function formProblems(defs: FieldDef[], draft: Draft, required: string[] = []): string[] {
  const out: string[] = [];
  for (const d of defs) {
    const v = draft[d.name];
    if (required.includes(d.name) && (v === '' || v === null || v === undefined)) out.push(`${d.label} is needed.`);
    if (d.kind === 'date' && String(v ?? '').trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) out.push(`${d.label}: type the date as year-month-day, like 2026-12-25.`);
    if (d.kind === 'num' && String(v ?? '').trim() !== '' && !Number.isFinite(numOf(String(v)))) out.push(`${d.label} should be a number.`);
    if (d.kind === 'whole' && String(v ?? '').trim() !== '' && !(Number.isInteger(numOf(String(v))) && numOf(String(v)) >= 0)) out.push(`${d.label} should be a whole number.`);
  }
  return out;
}
