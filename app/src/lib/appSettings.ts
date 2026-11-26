/**
 * The app's own few settings and small records, kept in Odoo so every phone
 * sees the same (the use-by alert window, unit matches). They live as lines
 * ("key=value") in the Internal Notes of one contact called "Food app
 * settings", which the owner makes by tapping a button once. The app never
 * changes an Odoo setting; this is only a note in a contact.
 *
 * Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export const SETTINGS_NAME = 'Food app settings';

export type Settings = Record<string, string>;

const strip = (html: string) =>
  html
    .replace(/<\/(p|div|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');

export function parseSettings(comment: unknown): Settings {
  const out: Settings = {};
  if (typeof comment !== 'string') return out;
  for (const line of strip(comment).split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export const writeSettings = (s: Settings) =>
  Object.entries(s)
    .map(([k, v]) => `<p>${k}=${v}</p>`)
    .join('');

/** The settings, or {} when the contact is not made yet or cannot be read. */
export async function loadSettings(c: Client): Promise<Settings> {
  try {
    const [p] = (await c.call('res.partner', 'search_read', [[['name', '=', SETTINGS_NAME]]], { fields: ['comment'], limit: 1 })) as { comment?: unknown }[];
    return parseSettings(p?.comment);
  } catch {
    return {};
  }
}

export const USE_BY_DEFAULT = 14;

export function useByDays(s: Settings): number {
  const n = Number(s.useByDays);
  return Number.isFinite(n) && n > 0 && n <= 365 ? Math.round(n) : USE_BY_DEFAULT;
}

/** The owner's default shelf life in days, used when a product has none in Odoo. Null when not set. */
export function shelfLifeDefault(s: Settings): number | null {
  const n = Number(s.shelfLifeDays);
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? Math.round(n) : null;
}

/** Saves one setting (makes the contact if needed). Owner only; goes through the queue. */
export function settingChange(key: string, value: string): NewChange {
  return {
    label: `Setting ${key} = ${value}`,
    model: 'res.partner',
    method: 'write',
    args: [],
    step: { kind: 'setting', key, value },
  };
}

/** Runs a setting step: reads the current lines, changes one, writes them back. Safe to run twice. */
export async function runSetting(c: Client, key: string, value: string): Promise<void> {
  const [p] = (await c.call('res.partner', 'search_read', [[['name', '=', SETTINGS_NAME]]], { fields: ['comment'], limit: 1 })) as { id: number; comment?: unknown }[];
  const next = { ...parseSettings(p?.comment), [key]: value };
  if (p) await c.call('res.partner', 'write', [[p.id], { comment: writeSettings(next) }], {});
  else await c.call('res.partner', 'create', [{ name: SETTINGS_NAME, comment: writeSettings(next), active: true }], {});
}
