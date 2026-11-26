/**
 * Storage places (pantry, freezer, market bin): what is on hand in each, and
 * moving stock from one to another. Needs Odoo's Storage Locations setting;
 * the app only checks it, never turns it on. A move is an internal transfer
 * made, reserved and validated in Odoo, once, from the offline queue.
 *
 * Kept free of React; the client is passed in.
 */
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call' | 'hasGroup'>;

export interface Place {
  id: number;
  name: string;
}

export interface PlaceStock {
  placeId: number;
  place: string;
  productId: number;
  product: string;
  lotId: number;
  lot: string;
  qty: number;
}

export const placesOn = (c: Client) => c.hasGroup('stock.group_stock_multi_locations');

export async function loadPlaces(c: Client): Promise<Place[]> {
  const rows = (await c.call('stock.location', 'search_read', [[['usage', '=', 'internal']]], { fields: ['complete_name', 'name'], order: 'complete_name asc', limit: 80 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.complete_name || r.name || '') }));
}

/** What is on hand, by place. */
export async function loadPlaceStock(c: Client): Promise<PlaceStock[]> {
  const rows = (await c.call('stock.quant', 'search_read', [[['location_id.usage', '=', 'internal'], ['quantity', '>', 0]]], { fields: ['location_id', 'product_id', 'lot_id', 'quantity'], limit: 400 })) as Record<string, unknown>[];
  const name = (v: unknown) => (Array.isArray(v) ? String(v[1] ?? '') : '');
  return rows.map((r) => ({ placeId: m2oId(r.location_id), place: name(r.location_id), productId: m2oId(r.product_id), product: name(r.product_id), lotId: m2oId(r.lot_id), lot: name(r.lot_id), qty: Number(r.quantity ?? 0) }));
}

/** Moves some of a product (and batch) from one place to another. */
export function moveChange(from: PlaceStock, to: Place, qty: number, now = Date.now()): NewChange {
  const token = `food-app-move-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    label: `Move ${qty} ${from.product} from ${from.place} to ${to.name}`,
    model: 'stock.picking',
    method: 'transfer',
    args: [],
    step: { kind: 'move', token, productId: from.productId, lotId: from.lotId, qty, fromId: from.placeId, toId: to.id },
  };
}

/** Runs a move step. Skipped if the transfer with this token is already done. */
export async function runMove(c: Pick<OdooClient, 'call'>, s: { token: string; productId: number; lotId: number; qty: number; fromId: number; toId: number }): Promise<void> {
  let [p] = (await c.call('stock.picking', 'search_read', [[['origin', '=', s.token]]], { fields: ['state'], limit: 1 })) as { id: number; state: string }[];
  if (p?.state === 'done') return;
  if (!p) {
    const [type] = (await c.call('stock.picking.type', 'search_read', [[['code', '=', 'internal']]], { fields: ['name'], limit: 1 })) as { id: number }[];
    if (!type) throw new Error('Odoo has no internal transfer type. Turn on Storage Locations in Odoo.');
    const id = (await c.call('stock.picking', 'create', [{ picking_type_id: type.id, location_id: s.fromId, location_dest_id: s.toId, origin: s.token, move_ids: [[0, 0, { name: 'Move', product_id: s.productId, product_uom_qty: s.qty, location_id: s.fromId, location_dest_id: s.toId }]] }], {})) as number;
    p = { id, state: 'draft' };
  }
  await c.call('stock.picking', 'action_confirm', [[p.id]], {});
  await c.call('stock.picking', 'action_assign', [[p.id]], {});
  if (s.lotId) {
    const moves = (await c.call('stock.move', 'search_read', [[['picking_id', '=', p.id]]], { fields: ['move_line_ids'] })) as { move_line_ids?: number[] }[];
    for (const lid of moves.flatMap((m) => m.move_line_ids ?? [])) await c.call('stock.move.line', 'write', [[lid], { lot_id: s.lotId, quantity: s.qty }], {});
  }
  await c.call('stock.picking', 'button_validate', [[p.id]], { context: { skip_backorder: true, skip_sms: true, skip_immediate: true } });
}
