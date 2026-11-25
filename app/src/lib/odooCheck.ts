/**
 * The connection check on the Developer screen: what this Odoo is, and
 * whether the apps and settings the food app relies on are there. It only
 * reads. It never installs an app or switches a setting on; anything missing
 * is listed for Justin to do in Odoo.
 *
 * Kept free of React; the client is passed in.
 */
import { costingLines, loadCosting } from './costing';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call' | 'session' | 'hasGroup' | 'hasModel'>;

/** The Odoo apps the plan uses, by their technical module name. */
export const NEEDED_APPS: { module: string; label: string; model: string }[] = [
  { module: 'mrp', label: 'Manufacturing (batches and recipes)', model: 'mrp.production' },
  { module: 'stock', label: 'Inventory', model: 'stock.lot' },
  { module: 'sale_management', label: 'Sales', model: 'sale.order' },
  { module: 'website_sale', label: 'eCommerce (website orders)', model: 'product.public.category' },
  { module: 'purchase', label: 'Purchase (ingredients)', model: 'purchase.order' },
  { module: 'point_of_sale', label: 'Point of Sale (market sales)', model: 'pos.config' },
  { module: 'hr', label: 'Employees (roles)', model: 'hr.employee' },
  { module: 'contacts', label: 'Contacts', model: 'res.partner' },
];

export interface CheckLine {
  label: string;
  ok: boolean;
  /** What it found, or what to do in Odoo when it's missing. */
  note: string;
}

export interface CheckReport {
  server: string;
  database: string;
  user: string;
  lines: CheckLine[];
}

async function installedModules(c: Client, names: string[]): Promise<Set<string> | null> {
  try {
    const rows = (await c.call('ir.module.module', 'search_read', [[['name', 'in', names], ['state', '=', 'installed']]], { fields: ['name'] })) as { name?: unknown }[];
    return new Set(rows.map((r) => String(r.name)));
  } catch {
    return null;
  }
}

export async function checkOdoo(c: Client): Promise<CheckReport> {
  const lines: CheckLine[] = [];
  const v = c.session.serverVersion;
  const major = parseInt(v, 10);
  lines.push({ label: 'Odoo version', ok: major === 19, note: v ? (major === 19 ? `Odoo ${v}` : `Odoo ${v}. The app is built for Odoo 19.`) : "Odoo didn't say its version." });

  const mods = await installedModules(c, [...NEEDED_APPS.map((a) => a.module), 'product_expiry']);
  for (const a of NEEDED_APPS) {
    const ok = mods ? mods.has(a.module) : await c.hasModel(a.model);
    lines.push({ label: a.label, ok, note: ok ? 'Installed' : 'Not found. Install it in Odoo Apps if this feature is needed.' });
  }

  // Lots and use-by dates: read only. The app never switches these on.
  const lots = await c.hasGroup('stock.group_production_lot');
  lines.push({ label: 'Batch numbers (lots)', ok: lots, note: lots ? 'On' : 'Off. Turn on Inventory > Settings > Lots & Serial Numbers in Odoo.' });
  let expiry = mods ? mods.has('product_expiry') : false;
  if (!mods) {
    const f = (await c.call('stock.lot', 'fields_get', [['expiration_date']], { attributes: ['type'] }).catch(() => null)) as Record<string, unknown> | null;
    expiry = !!f && 'expiration_date' in f;
  }
  lines.push({ label: "Use-by dates", ok: expiry, note: expiry ? 'On' : 'Off. Turn on Inventory > Settings > Expiration Dates in Odoo.' });

  // Costing: read only. Raw materials should be on Average Cost so what you pay sets the cost.
  try {
    lines.push(...costingLines(await loadCosting(c)));
  } catch {
    // Categories not readable: leave the costing lines out.
  }

  return { server: c.session.url, database: c.session.db, user: `${c.session.name} (${c.session.login})`, lines };
}
