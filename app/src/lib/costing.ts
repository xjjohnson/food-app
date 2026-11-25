/**
 * How Odoo works out what things cost. With "Average Cost" on a product
 * category, Odoo sets a product's cost itself from what was paid for each
 * delivery and each batch, so the app shows Cost as read-only there. The app
 * only reads this. It never changes a costing method.
 *
 * Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export const COST_METHODS: Record<string, string> = { standard: 'Standard Price', average: 'Average Cost (AVCO)', fifo: 'First In First Out (FIFO)' };

export interface CategoryCosting {
  id: number;
  name: string;
  method: string;
  /** "Automated" or "Manual", as Odoo says. Empty when this Odoo doesn't say. */
  valuation: string;
}

/** The costing method of one product category, or '' when unreadable. */
export async function categoryCostMethod(c: Client, categoryId: number): Promise<string> {
  try {
    const [r] = (await c.call('product.category', 'read', [[categoryId]], { fields: ['property_cost_method'] })) as { property_cost_method?: unknown }[];
    return typeof r?.property_cost_method === 'string' ? r.property_cost_method : '';
  } catch {
    return '';
  }
}

/** Every product category with its costing method and stock valuation. */
export async function loadCosting(c: Client): Promise<CategoryCosting[]> {
  const rows = (await c.call('product.category', 'search_read', [[]], { fields: ['complete_name', 'name', 'property_cost_method', 'property_valuation'], order: 'complete_name asc', limit: 100 })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: String(r.complete_name || r.name || ''),
    method: typeof r.property_cost_method === 'string' ? r.property_cost_method : '',
    valuation: r.property_valuation === 'real_time' ? 'Automated' : r.property_valuation === 'periodic' || r.property_valuation === 'manual_periodic' ? 'Manual' : typeof r.property_valuation === 'string' ? r.property_valuation : '',
  }));
}

/**
 * Plain-words lines for the Developer screen. Raw material categories should
 * be on Average Cost; if not, it says so and what to change in Odoo.
 */
export function costingLines(rows: CategoryCosting[]): { label: string; ok: boolean; note: string }[] {
  return rows
    .filter((r) => r.method)
    .map((r) => {
      const raw = /raw/i.test(r.name);
      const ok = !raw || r.method === 'average';
      return {
        label: `Costing: ${r.name}`,
        ok,
        note: `${COST_METHODS[r.method] ?? r.method}${r.valuation ? `, stock value ${r.valuation}` : ''}${ok ? '' : '. Raw materials should be on Average Cost. Change it in Odoo: Inventory, Configuration, Product Categories.'}`,
      };
    });
}
