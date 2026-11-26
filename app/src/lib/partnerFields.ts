/**
 * Which of these contact fields this Odoo has. Odoo 19 dropped Mobile, and
 * asking for a field Odoo doesn't have makes the whole read fail, so reads of
 * a contact only ask for what exists.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;
const known = new WeakMap<object, Promise<Set<string>>>();

export async function partnerFields(c: Client, wanted: string[]): Promise<string[]> {
  let have = known.get(c);
  if (!have) {
    have = (c.call('res.partner', 'fields_get', [], { attributes: ['type'] }) as Promise<Record<string, unknown>>).then((f) => new Set(Object.keys(f)));
    known.set(c, have);
    have.catch(() => known.delete(c));
  }
  const set = await have;
  return wanted.filter((f) => set.has(f));
}
