/**
 * The delivery board: today's deliveries and pickups, with where they go and
 * what step they are at. Steps: To pack (Odoo's delivery is waiting), Packed
 * (the delivery is done in Odoo), Delivered (a note on the sale order, posted
 * from the app, because Odoo has no step for it). Read only except that note.
 */
import { m2oId, type OdooClient } from './odoo';
import { pickupSales } from './orders';
import { partnerFields } from './partnerFields';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export type Step = 'pack' | 'packed' | 'delivered';

export interface BoardOrder {
  id: number;
  name: string;
  saleId: number;
  origin: string;
  customer: string;
  partnerId?: number;
  zip?: string;
  phone: string;
  address: string;
  notes: string;
  date: string;
  step: Step;
  /** The order's delivery method in Odoo is a pickup. */
  pickup?: boolean;
}

export const STEP_WORDS: Record<Step, string> = { pack: 'To pack', packed: 'Packed', delivered: 'Delivered' };

const DELIVERED_TAG = 'food-app-delivered';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Deliveries due by the end of today, plus ones done in the last 2 days (so Delivered can be ticked). */
export async function loadBoard(c: Client, now = new Date()): Promise<BoardOrder[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const end = `${day(now)} 23:59:59`;
  const since = `${day(new Date(now.getTime() - 2 * 86400000))} 00:00:00`;
  const fields = ['name', 'origin', 'partner_id', 'state', 'scheduled_date', 'sale_id'];
  const open = (await c.call('stock.picking', 'search_read', [[['picking_type_code', '=', 'outgoing'], ['state', 'in', ['assigned', 'confirmed', 'waiting']], ['scheduled_date', '<=', end]]], { fields, order: 'scheduled_date asc, id asc', limit: 80 })) as Record<string, unknown>[];
  const recent = (await c.call('stock.picking', 'search_read', [[['picking_type_code', '=', 'outgoing'], ['state', '=', 'done'], ['date_done', '>=', since]]], { fields, order: 'scheduled_date asc, id asc', limit: 80 })) as Record<string, unknown>[];
  const rows = [...open, ...recent].sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)));
  if (!rows.length) return [];
  const partnerIds = [...new Set(rows.map((r) => m2oId(r.partner_id)).filter(Boolean))];
  const partners = partnerIds.length ? ((await c.call('res.partner', 'read', [partnerIds], { fields: await partnerFields(c, ['phone', 'mobile', 'street', 'street2', 'city', 'zip', 'comment']) })) as Record<string, unknown>[]) : [];
  const saleIds = rows.map((r) => m2oId(r.sale_id)).filter(Boolean);
  const done = saleIds.length ? ((await c.call('mail.message', 'search_read', [[['model', '=', 'sale.order'], ['res_id', 'in', saleIds], ['body', 'ilike', DELIVERED_TAG]]], { fields: ['res_id'] })) as { res_id: number }[]) : [];
  const delivered = new Set(done.map((m) => m.res_id));
  const pickups = await pickupSales(c, saleIds);
  return rows
    .map((r) => {
      const p = partners.find((x) => x.id === m2oId(r.partner_id)) ?? {};
      const saleId = m2oId(r.sale_id);
      const picked = r.state === 'done';
      const step: Step = picked ? (delivered.has(saleId) ? 'delivered' : 'packed') : 'pack';
      return {
        id: r.id as number,
        name: str(r.name),
        saleId,
        origin: str(r.origin),
        customer: Array.isArray(r.partner_id) ? String(r.partner_id[1] ?? '') : '',
        partnerId: m2oId(r.partner_id) || undefined,
        zip: str(p.zip) || undefined,
        phone: str(p.mobile) || str(p.phone),
        address: [p.street, p.street2, p.city, p.zip].filter((x) => typeof x === 'string' && x).join(', '),
        notes: str(p.comment).replace(/<[^>]+>/g, ' ').trim(),
        date: str(r.scheduled_date),
        step,
        ...(pickups.has(saleId) ? { pickup: true } : {}),
      };
    });
}

export const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Saves "Delivered" as a note on the sale order, once, through the queue. */
export function deliveredChange(o: BoardOrder): NewChange {
  return {
    label: `${o.pickup ? 'Picked up' : 'Delivered'}: ${o.customer || o.origin || o.name}`,
    model: 'sale.order',
    method: 'message_post',
    args: [],
    step: { kind: 'note', model: 'sale.order', resId: o.saleId, tag: DELIVERED_TAG, body: o.pickup ? 'Picked up' : 'Delivered' },
  };
}
