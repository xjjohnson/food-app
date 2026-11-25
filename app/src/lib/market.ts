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

export interface MarketInfo {
  registers: Register[];
  /** Payment methods Odoo has, by name. */
  payments: string[];
}

export async function loadMarket(c: Client): Promise<MarketInfo> {
  const configs = (await c.call('pos.config', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 20 })) as { id: number; name: string }[];
  const methods = (await c.call('pos.payment.method', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 30 })) as { name: string }[];
  return { registers: configs.map((r) => ({ id: r.id, name: r.name })), payments: methods.map((m) => m.name) };
}

/** The address of a register's selling screen in this Odoo. */
export const posUrl = (odooUrl: string, configId: number) => `${odooUrl.replace(/\/+$/, '')}/pos/ui?config_id=${configId}`;
