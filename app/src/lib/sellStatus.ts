/**
 * The colored status buttons on the Sell tab: counts read from Odoo, never
 * worked out from old phone data. Orders: packed, still to pack, and late
 * (due before today and not yet delivered). Customers: how many, who owes,
 * and who is past the due date.
 */
import { loadBoard } from './deliveryBoard';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface OrderStatus {
  packed: number;
  toPack: number;
  /** Orders that need product first, so they wait in Waiting for stock. */
  needs: number;
  late: number;
}

export interface CustomerStatus {
  customers: number;
  owe: number;
  overdue: number;
}

const startOfDay = (now: Date) => now.toISOString().slice(0, 10);

/** Counts from the sold board: Odoo's own delivery steps. */
export async function loadOrderStatus(c: Client, now = new Date()): Promise<OrderStatus> {
  const rows = await loadBoard(c, now);
  const today = startOfDay(now);
  const open = rows.filter((r) => r.step !== 'delivered');
  return {
    packed: rows.filter((r) => r.step === 'packed').length,
    toPack: rows.filter((r) => r.step === 'pack' && !r.short).length,
    needs: rows.filter((r) => r.step === 'pack' && r.short).length,
    late: open.filter((r) => r.date.slice(0, 10) < today).length,
  };
}

/** Customers, and unpaid customer invoices, from Odoo. A part Odoo cannot answer counts as 0. */
export async function loadCustomerStatus(c: Client, now = new Date()): Promise<CustomerStatus> {
  const count = async (model: string, domain: unknown[]) => {
    try {
      return (await c.call(model, 'search_count', [domain])) as number;
    } catch {
      return 0;
    }
  };
  const unpaid: unknown[] = [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']]];
  const [customers, owe, overdue] = await Promise.all([
    count('res.partner', [['customer_rank', '>', 0]]),
    count('account.move', unpaid),
    count('account.move', [...unpaid, ['invoice_date_due', '<', startOfDay(now)]]),
  ]);
  return { customers, owe, overdue };
}
