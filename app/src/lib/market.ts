/**
 * Market: sales are rung up in Odoo's own Point of Sale, which works on a phone
 * or tablet and handles payments, receipts and batch numbers. The app only
 * opens it, and shows which registers and payment methods Odoo has set up.
 * It never changes either; payments (cash, Cash App, Venmo) are set up in Odoo.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface Register {
  id: number;
  name: string;
}

export interface OpenRegister {
  /** The register (pos.config) that is open. */
  configId: number;
  name: string;
  /** When it was opened, as Odoo says (UTC), or ''. */
  since: string;
}

export interface MarketInfo {
  registers: Register[];
  /** Registers that are open right now. Read only. */
  open: OpenRegister[];
  /** Payment methods Odoo has, by name. */
  payments: string[];
}

export async function loadMarket(c: Client): Promise<MarketInfo> {
  const configs = (await c.call('pos.config', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 20 })) as { id: number; name: string }[];
  const methods = (await c.call('pos.payment.method', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 30 })) as { name: string }[];
  let open: OpenRegister[] = [];
  try {
    const sessions = (await c.call('pos.session', 'search_read', [[['state', 'in', ['opening_control', 'opened', 'closing_control']]]], { fields: ['config_id', 'start_at'], order: 'start_at asc', limit: 20 })) as { config_id: unknown; start_at?: unknown }[];
    open = sessions.map((s) => ({ configId: Array.isArray(s.config_id) ? Number(s.config_id[0]) : Number(s.config_id), name: Array.isArray(s.config_id) ? String(s.config_id[1]) : '', since: typeof s.start_at === 'string' ? s.start_at : '' }));
  } catch {
    // No Point of Sale sessions to read: just show no open registers.
  }
  return { registers: configs.map((r) => ({ id: r.id, name: r.name })), open, payments: methods.map((m) => m.name) };
}

/** "open 3 h", "open 2 days": how long a register has been open. */
export function openFor(since: string, now = Date.now()): string {
  const t = Date.parse(since.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return 'open';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return `open ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `open ${hours} h`;
  return `open ${Math.round(hours / 24)} days`;
}

/** The address of a register's selling screen in this Odoo. */
export const posUrl = (odooUrl: string, configId: number) => `${odooUrl.replace(/\/+$/, '')}/pos/ui?config_id=${configId}`;
