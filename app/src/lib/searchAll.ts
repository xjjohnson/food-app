/**
 * One search box: finds products, customers and suppliers, batches, sale orders
 * and batches being made, by name. Read only. A kind that can't be read for this
 * person (app not installed, no access) is left out.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface Hit {
  kind: 'Product' | 'Contact' | 'Batch number' | 'Order' | 'Batch being made';
  id: number;
  title: string;
  detail: string;
}

const SOURCES: { kind: Hit['kind']; model: string; fields: string[]; domains: (t: string) => unknown[][]; title: (r: Record<string, unknown>) => string; detail: (r: Record<string, unknown>) => string }[] = [
  { kind: 'Product', model: 'product.template', fields: ['name', 'list_price', 'default_code'], domains: (t) => [[['name', 'ilike', t]]], title: (r) => String(r.name ?? ''), detail: (r) => String(r.default_code || '') },
  { kind: 'Contact', model: 'res.partner', fields: ['name', 'phone', 'email'], domains: (t) => [[['name', 'ilike', t]], [['phone', 'ilike', t]]], title: (r) => String(r.name ?? ''), detail: (r) => [r.phone, r.email].filter(Boolean).join(' · ') },
  { kind: 'Batch number', model: 'stock.lot', fields: ['name', 'product_id'], domains: (t) => [[['name', 'ilike', t]]], title: (r) => String(r.name ?? ''), detail: (r) => (Array.isArray(r.product_id) ? String(r.product_id[1] ?? '') : '') },
  { kind: 'Order', model: 'sale.order', fields: ['name', 'partner_id', 'state'], domains: (t) => [[['name', 'ilike', t]], [['partner_id', 'ilike', t]]], title: (r) => String(r.name ?? ''), detail: (r) => (Array.isArray(r.partner_id) ? String(r.partner_id[1] ?? '') : '') },
  { kind: 'Batch being made', model: 'mrp.production', fields: ['name', 'product_id', 'state'], domains: (t) => [[['name', 'ilike', t]], [['product_id', 'ilike', t]]], title: (r) => String(r.name ?? ''), detail: (r) => (Array.isArray(r.product_id) ? String(r.product_id[1] ?? '') : '') },
];

export async function searchAll(c: Client, text: string): Promise<Hit[]> {
  const t = text.trim();
  if (t.length < 2) return [];
  const parts = await Promise.all(
    SOURCES.map(async (s) => {
      try {
        const found = await Promise.all(s.domains(t).map((d) => c.call(s.model, 'search_read', [d], { fields: s.fields, limit: 8 }) as Promise<Record<string, unknown>[]>));
        const seen = new Set<number>();
        const rows = found.flat().filter((r) => !seen.has(r.id as number) && !!seen.add(r.id as number)).slice(0, 8);
        return rows.map((r) => ({ kind: s.kind, id: r.id as number, title: s.title(r), detail: s.detail(r) }));
      } catch {
        return [];
      }
    }),
  );
  return parts.flat();
}
