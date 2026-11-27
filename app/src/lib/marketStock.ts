/**
 * Market stock as real Odoo transfers. Check out moves what you take from the
 * pantry to a "Market" place; check in moves what came back. The Point of
 * Sale takes sold items off the Market place, so Odoo always knows what is in
 * the car.
 *
 * The setup (turn on Storage Locations, add the Market place, point the
 * register at it) is only ever done by the owner tapping the button in
 * Management, which says exactly what it changes. Nothing here runs by
 * itself. Kept free of React; the client is passed in.
 */
import { loadPlaces, loadPlaceStock, moveChange, type Place, type PlaceStock } from './places';
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call' | 'hasGroup'>;

export const MARKET_PLACE = 'Market';

export const isMarket = (p: { name: string }) => p.name === MARKET_PLACE || p.name.endsWith(`/${MARKET_PLACE}`);

/** The Market place, or null when Storage Locations is off or none is made yet. */
export async function findMarketPlace(c: Client): Promise<Place | null> {
  try {
    if (!(await c.hasGroup('stock.group_stock_multi_locations'))) return null;
    return (await loadPlaces(c)).find(isMarket) ?? null;
  } catch {
    return null;
  }
}

export interface MarketSetup {
  storageLocationsWasOn: boolean;
  placeMade: boolean;
  registers: number;
}

/**
 * The owner-tap setup. It (1) turns on Storage Locations if it is off, (2) adds a
 * place called Market inside the main warehouse if there is none, (3) sets the
 * Point of Sale operation types to take stock from Market. Safe to tap again.
 */
export async function setUpMarketStock(c: Client): Promise<MarketSetup> {
  const on = await c.hasGroup('stock.group_stock_multi_locations');
  if (!on) {
    const id = (await c.call('res.config.settings', 'create', [{ group_stock_multi_locations: true }], {})) as number;
    await c.call('res.config.settings', 'execute', [[id]], {});
  }
  let place = (await loadPlaces(c)).find(isMarket);
  let placeMade = false;
  if (!place) {
    const [wh] = (await c.call('stock.warehouse', 'search_read', [[]], { fields: ['view_location_id'], limit: 1 })) as { view_location_id?: unknown }[];
    const parent = Array.isArray(wh?.view_location_id) ? (wh!.view_location_id[0] as number) : 0;
    const id = (await c.call('stock.location', 'create', [{ name: MARKET_PLACE, usage: 'internal', ...(parent ? { location_id: parent } : {}) }], {})) as number;
    place = { id, name: MARKET_PLACE };
    placeMade = true;
  }
  const configs = (await c.call('pos.config', 'search_read', [[]], { fields: ['picking_type_id'] })) as { picking_type_id?: unknown }[];
  const typeIds = [...new Set(configs.map((r) => (Array.isArray(r.picking_type_id) ? (r.picking_type_id[0] as number) : 0)).filter(Boolean))];
  if (typeIds.length) await c.call('stock.picking.type', 'write', [typeIds, { default_location_src_id: place.id }], {});
  return { storageLocationsWasOn: on, placeMade, registers: typeIds.length };
}

/** Stock by product and batch in one set of places. */
export async function loadStockAt(c: Client, market: Place): Promise<{ market: PlaceStock[]; main: PlaceStock[] }> {
  const all = await loadPlaceStock(c);
  return { market: all.filter((s) => s.placeId === market.id), main: all.filter((s) => s.placeId !== market.id) };
}

/**
 * Check out: for each product, take the amount from the pantry batches (most
 * stock first) and move it to Market. Returns the changes to save and what
 * the pantry could not cover.
 */
export function checkOutChanges(want: { productId: number; qty: number }[], main: PlaceStock[], market: Place, now = Date.now()): { changes: NewChange[]; short: { productId: number; missing: number }[] } {
  const changes: NewChange[] = [];
  const short: { productId: number; missing: number }[] = [];
  let n = 0;
  for (const w of want) {
    let left = w.qty;
    const have = main.filter((s) => s.productId === w.productId && s.qty > 0).sort((a, b) => b.qty - a.qty);
    for (const q of have) {
      if (left <= 0) break;
      const take = Math.min(left, q.qty);
      changes.push(moveChange(q, market, take, now + n++));
      left -= take;
    }
    if (left > 0) short.push({ productId: w.productId, missing: left });
  }
  return { changes, short };
}

/** Check in: moves what came back from Market to the pantry place each product came from. */
export function checkInChanges(back: { productId: number; qty: number }[], inMarket: PlaceStock[], main: PlaceStock[], home: Place | null, now = Date.now()): NewChange[] {
  const out: NewChange[] = [];
  let n = 0;
  for (const b of back) {
    let left = b.qty;
    for (const q of inMarket.filter((s) => s.productId === b.productId && s.qty > 0)) {
      if (left <= 0) break;
      const take = Math.min(left, q.qty);
      const dest = main.find((m) => m.productId === b.productId)?.placeId ?? home?.id ?? 0;
      if (!dest) continue;
      out.push(moveChange(q, { id: dest, name: 'the pantry' }, take, now + n++));
      left -= take;
    }
  }
  return out;
}
