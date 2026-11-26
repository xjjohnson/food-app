/**
 * The Today card on the home screen: for each of the person's roles, what
 * needs doing now, counted from Odoo. Only counts; nothing is saved.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { loadSettings, useByDays } from './appSettings';
import { loadRules } from './ingredients';
import type { OdooClient } from './odoo';
import { loadExpiring } from './stock';
import type { RoleId, Roles } from './roles';
import { seasonCounts } from './season';

type Client = Pick<OdooClient, 'call'>;

export interface TodayItem {
  id: string;
  title: string;
  count: number;
  /** The area this opens. */
  area: string;
  role: RoleId;
}

const count = async (c: Client, model: string, domain: unknown[]) => Number(await c.call(model, 'search_count', [domain])) || 0;

/** The things waiting for this person. A count that can't be read (an app not installed, no access) is left out. */
export async function loadToday(c: Client, roles: Roles): Promise<TodayItem[]> {
  const out: TodayItem[] = [];
  const add = async (item: Omit<TodayItem, 'count'>, get: () => Promise<number>) => {
    if (!(roles.owner || roles[item.role])) return;
    try {
      out.push({ ...item, count: await get() });
    } catch {
      // Not readable for this person: skip it.
    }
  };
  await add({ id: 'batches', title: 'Batches to make or finish', area: 'production', role: 'production' }, () => count(c, 'mrp.production', [['state', 'in', ['confirmed', 'progress', 'to_close']]]));
  await add({ id: 'orders', title: 'Website orders to pack', area: 'orders', role: 'shipping' }, () => count(c, 'stock.picking', [['picking_type_code', '=', 'outgoing'], ['state', '=', 'assigned'], ['sale_id.website_id', '!=', false]]));
  await add({ id: 'expiring', title: 'Batches close to their use-by date', area: 'stock', role: 'inventory' }, async () => (await loadExpiring(c, useByDays(await loadSettings(c)))).length);
  await add({ id: 'low', title: 'Ingredients running low', area: 'ingredients', role: 'inventory' }, async () => (await loadRules(c, true)).length);
  await add({ id: 'deliveries', title: 'Deliveries to check in', area: 'ingredients', role: 'inventory' }, () => count(c, 'stock.picking', [['picking_type_code', '=', 'incoming'], ['state', '=', 'assigned']]));
  await add({ id: 'web-new', title: 'New website orders (last 3 days)', area: 'orders', role: 'shipping' }, () => count(c, 'sale.order', [['website_id', '!=', false], ['state', '=', 'sale'], ['date_order', '>=', `${new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)} 00:00:00`]]));
  await add({ id: 'season-now', title: 'Products in season now', area: 'sell', role: 'sales' }, async () => seasonCounts(await loadSettings(c)).now);
  await add({ id: 'season-soon', title: 'Products starting their season soon', area: 'sell', role: 'sales' }, async () => seasonCounts(await loadSettings(c)).soon);
  await add({ id: 'owed', title: 'Invoices not paid yet', area: 'invoices', role: 'sales' }, () => count(c, 'account.move', [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']]]));
  await add({ id: 'out-today', title: 'Deliveries and pickups due today', area: 'orders', role: 'shipping' }, () => count(c, 'stock.picking', [['picking_type_code', '=', 'outgoing'], ['state', 'in', ['assigned', 'confirmed', 'waiting']], ['scheduled_date', '<=', `${new Date().toISOString().slice(0, 10)} 23:59:59`]]));
  return out;
}
