/**
 * Price history per ingredient: what was paid, to whom and when, from the
 * vendor bill lines in Odoo. Read only; every number is Odoo's own.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface PricePoint {
  id: number;
  date: string;
  store: string;
  price: number;
  qty: number;
  bill: string;
  cheapest: boolean;
}

/** Newest first. The lowest price shown is marked. */
export async function loadPriceHistory(c: Client, templateId: number): Promise<PricePoint[]> {
  const prods = (await c.call('product.product', 'search', [[['product_tmpl_id', '=', templateId]]], { context: { active_test: false } })) as number[];
  if (!prods.length) return [];
  const rows = (await c.call('account.move.line', 'search_read', [[['product_id', 'in', prods], ['move_type', '=', 'in_invoice'], ['parent_state', '!=', 'cancel'], ['display_type', '=', 'product']]], {
    fields: ['date', 'partner_id', 'price_unit', 'quantity', 'move_name'],
    order: 'date desc, id desc',
    limit: 60,
  })) as Record<string, unknown>[];
  const list: PricePoint[] = rows.map((r) => ({
    id: r.id as number,
    date: typeof r.date === 'string' ? r.date : '',
    store: Array.isArray(r.partner_id) ? String(r.partner_id[1] ?? '') : '',
    price: Number(r.price_unit ?? 0),
    qty: Number(r.quantity ?? 0),
    bill: String(r.move_name ?? ''),
    cheapest: false,
  }));
  const low = list.length ? Math.min(...list.map((p) => p.price)) : 0;
  return list.map((p) => ({ ...p, cheapest: list.length > 1 && p.price === low }));
}
