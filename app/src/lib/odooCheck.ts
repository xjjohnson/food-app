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

/** What the newer features use. Missing ones only switch their own feature off. */
export const FEATURE_ADDONS: { group: string; label: string; module?: string; model?: string; groupXml?: string; fix: string }[] = [
  { group: 'Selling', label: 'Invoices and payments (Invoicing)', module: 'account', model: 'account.move', fix: 'Install Invoicing in Odoo Apps.' },
  { group: 'Selling', label: 'Price lists', groupXml: 'product.group_product_pricelist', fix: 'Turn on Sales > Settings > Pricelists in Odoo.' },
  { group: 'Selling', label: 'Discount codes (Loyalty)', module: 'loyalty', model: 'loyalty.program', fix: 'Install Discount & Loyalty in Odoo Apps (comes with eCommerce or Point of Sale).' },
  { group: 'Selling', label: 'Local delivery', module: 'delivery', model: 'delivery.carrier', fix: 'Install Delivery Methods in Odoo Apps.' },
  { group: 'Selling', label: 'Email newsletter (Email Marketing)', module: 'mass_mailing', model: 'mailing.mailing', fix: 'Install Email Marketing in Odoo Apps.' },
  { group: 'Selling', label: 'Market and events (Events)', module: 'event', model: 'event.event', fix: 'Install Events in Odoo Apps.' },
  { group: 'Selling', label: 'Customer feedback (Surveys)', module: 'survey', model: 'survey.survey', fix: 'Install Surveys in Odoo Apps.' },
  { group: 'Kitchen', label: 'Storage places (Storage Locations)', groupXml: 'stock.group_stock_multi_locations', fix: 'Turn on Inventory > Settings > Storage Locations in Odoo.' },
  { group: 'Extras', label: 'Tasks and reminders (Discuss activities)', module: 'mail', model: 'mail.activity', fix: 'Install Discuss in Odoo Apps.' },
  { group: 'Extras', label: 'Mileage (Fleet)', module: 'fleet', model: 'fleet.vehicle.odometer', fix: 'Install Fleet in Odoo Apps.' },
];

export interface CheckLine {
  /** Heading it is listed under, when it belongs to a group. */
  group?: string;
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

  const mods = await installedModules(c, [...NEEDED_APPS.map((a) => a.module), 'product_expiry', ...FEATURE_ADDONS.flatMap((f) => (f.module ? [f.module] : []))]);
  for (const a of NEEDED_APPS) {
    const ok = mods ? mods.has(a.module) : await c.hasModel(a.model);
    lines.push({ group: 'Core', label: a.label, ok, note: ok ? 'Installed' : 'Not found. Install it in Odoo Apps if this feature is needed.' });
  }

  // Lots and use-by dates: read only. The app never switches these on.
  const lots = await c.hasGroup('stock.group_production_lot');
  lines.push({ group: 'Core', label: 'Batch numbers (lots)', ok: lots, note: lots ? 'On' : 'Off. Turn on Inventory > Settings > Lots & Serial Numbers in Odoo.' });
  let expiry = mods ? mods.has('product_expiry') : false;
  if (!mods) {
    const f = (await c.call('stock.lot', 'fields_get', [['expiration_date']], { attributes: ['type'] }).catch(() => null)) as Record<string, unknown> | null;
    expiry = !!f && 'expiration_date' in f;
  }
  lines.push({ group: 'Core', label: "Use-by dates", ok: expiry, note: expiry ? 'On' : 'Off. Turn on Inventory > Settings > Expiration Dates in Odoo.' });

  // Newer features: read only. Missing ones switch off just their own feature.
  for (const f of FEATURE_ADDONS) {
    let ok = false;
    try {
      if (f.groupXml) ok = await c.hasGroup(f.groupXml);
      else ok = mods && f.module ? mods.has(f.module) : f.model ? await c.hasModel(f.model) : false;
    } catch {
      ok = false;
    }
    lines.push({ group: f.group, label: f.label, ok, note: ok ? 'Found' : `Missing. ${f.fix} Only this feature stays off until then.` });
  }

  // Costing: read only. Raw materials should be on Average Cost so what you pay sets the cost.
  try {
    lines.push(...costingLines(await loadCosting(c)));
  } catch {
    // Categories not readable: leave the costing lines out.
  }

  return { server: c.session.url, database: c.session.db, user: `${c.session.name} (${c.session.login})`, lines };
}
