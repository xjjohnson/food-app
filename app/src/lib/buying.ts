/**
 * Buying extras: supplier scorecard, draft orders per supplier, the delivery
 * route, mileage (the free Fleet app), scanning a code, and a label text.
 *
 * Draft orders are never confirmed by the app; the person confirms them in
 * Odoo or on the purchase screen. Mileage shows only when Fleet is installed.
 * Kept free of React; the client is passed in.
 */
import { loadAllergens } from './allergens';
import { m2oId, type OdooClient } from './odoo';
import type { NewChange } from './queue';
import type { BatchTrace } from './stock';

type Client = Pick<OdooClient, 'call'>;

const day = (v: unknown) => String(v ?? '').slice(0, 10);
const nm = (v: unknown) => (Array.isArray(v) ? String(v[1] ?? '') : '');

// ---- Supplier scorecard ----

export interface Scorecard {
  orders: number;
  onTime: number;
  late: number;
  /** Items whose latest price differs from the one before. */
  priceChanges: { product: string; from: number; to: number }[];
  lastDeliveries: { order: string; planned: string; done: string; onTime: boolean }[];
}

export async function loadScorecard(c: Client, partnerId: number): Promise<Scorecard> {
  const orders = (await c.call('purchase.order', 'search_read', [[['partner_id', '=', partnerId], ['state', 'in', ['purchase', 'done']]]], { fields: ['name', 'date_planned', 'date_approve', 'picking_ids'], limit: 50 })) as Record<string, unknown>[];
  orders.sort((a, z) => day(z.date_approve).localeCompare(day(a.date_approve)));
  const pickIds = orders.flatMap((o) => (Array.isArray(o.picking_ids) ? (o.picking_ids as number[]) : []));
  const picks = pickIds.length ? ((await c.call('stock.picking', 'read', [pickIds], { fields: ['date_done', 'state'] })) as Record<string, unknown>[]) : [];
  const deliveries = orders.flatMap((o) => {
    const mine = picks.filter((p) => ((o.picking_ids as number[]) ?? []).includes(p.id as number) && p.state === 'done' && p.date_done);
    if (!mine.length) return [];
    const done = mine.map((p) => day(p.date_done)).sort().pop()!;
    const planned = day(o.date_planned);
    return [{ order: String(o.name), planned, done, onTime: !planned || done <= planned }];
  });
  const lines = orders.length ? ((await c.call('purchase.order.line', 'search_read', [[['order_id', 'in', orders.map((o) => o.id)]]], { fields: ['order_id', 'product_id', 'price_unit'] })) as Record<string, unknown>[]) : [];
  const order = new Map(orders.map((o, i) => [o.id as number, i]));
  const byProduct = new Map<string, { at: number; price: number }[]>();
  for (const l of lines) {
    const key = nm(l.product_id);
    const at = order.get(m2oId(l.order_id)) ?? 0;
    byProduct.set(key, [...(byProduct.get(key) ?? []), { at, price: Number(l.price_unit ?? 0) }]);
  }
  const priceChanges: Scorecard['priceChanges'] = [];
  for (const [product, list] of byProduct) {
    const s = list.sort((a, z) => a.at - z.at); // newest first (orders sorted newest first)
    if (s.length > 1 && s[0]!.price !== s[1]!.price) priceChanges.push({ product, from: s[1]!.price, to: s[0]!.price });
  }
  return { orders: orders.length, onTime: deliveries.filter((d) => d.onTime).length, late: deliveries.filter((d) => !d.onTime).length, priceChanges, lastDeliveries: deliveries.slice(0, 5) };
}

// ---- Draft orders per supplier ----

export interface BuyLine {
  productId: number;
  name: string;
  qty: number;
  supplierId: number;
  supplier: string;
  /** The product's own unit in Odoo, so the amount is read in the unit shown. */
  uomId?: number;
}

/** One draft purchase order per supplier, once a day. Lines without a usual supplier are left out. */
export function draftOrderChanges(rows: BuyLine[], today: string): NewChange[] {
  const bySupplier = new Map<number, BuyLine[]>();
  for (const r of rows.filter((x) => x.supplierId && x.qty > 0)) bySupplier.set(r.supplierId, [...(bySupplier.get(r.supplierId) ?? []), r]);
  return [...bySupplier.entries()].map(([supplierId, lines]) => {
    const token = `food-app-draft-${today}-${supplierId}`;
    return {
      label: `Draft order: ${lines[0]!.supplier} (${lines.length} ${lines.length === 1 ? 'item' : 'items'})`,
      model: 'purchase.order',
      method: 'create',
      args: [{ partner_id: supplierId, origin: token, order_line: lines.map((l) => [0, 0, { product_id: l.productId, product_qty: l.qty, ...(l.uomId ? { product_uom_id: l.uomId } : {}) }]) }],
      already: { model: 'purchase.order', domain: [['origin', '=', token]] },
    };
  });
}

// ---- Delivery route ----

export interface Stop {
  id: number;
  address: string;
  zip: string;
}

export const sortByZip = <T extends Stop>(stops: T[]): T[] => [...stops].sort((a, z) => Number(!a.zip) - Number(!z.zip) || a.zip.localeCompare(z.zip) || a.id - z.id);

export const routeKey = (date: string) => `route.${date}`;

/** Puts stops in the saved order; stops not in the saved line go last in their old order. */
export function applyRoute<T extends { id: number }>(stops: T[], line: string | undefined): T[] {
  const ids = (line ?? '').split(',').map(Number).filter(Boolean);
  const rank = (s: T) => (ids.includes(s.id) ? ids.indexOf(s.id) : ids.length);
  return [...stops].sort((a, z) => rank(a) - rank(z));
}

export const moveStop = <T,>(list: T[], i: number, by: -1 | 1): T[] => {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
};

/** One maps link for the whole route, in order. The app doesn't plan the route. */
export function routeLink(stops: { address: string }[]): string {
  const a = stops.map((s) => s.address).filter(Boolean);
  if (!a.length) return '';
  const q = (t: string) => encodeURIComponent(t);
  const dest = a[a.length - 1]!;
  const way = a.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${q(dest)}${way.length ? `&waypoints=${way.map(q).join('%7C')}` : ''}`;
}

// ---- Mileage (Fleet) ----

export interface Vehicle {
  id: number;
  name: string;
  odometer: number;
}

/** The vehicles, or null when the Fleet app is not installed. */
export async function loadVehicles(c: Client): Promise<Vehicle[] | null> {
  try {
    const rows = (await c.call('fleet.vehicle', 'search_read', [[]], { fields: ['name', 'odometer'], limit: 30 })) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, name: String(r.name ?? ''), odometer: Number(r.odometer ?? 0) }));
  } catch {
    return null;
  }
}

export interface Reading {
  id: number;
  date: string;
  value: number;
}

export async function loadReadings(c: Client, vehicleId: number): Promise<Reading[]> {
  const rows = (await c.call('fleet.vehicle.odometer', 'search_read', [[['vehicle_id', '=', vehicleId]]], { fields: ['date', 'value'], limit: 20 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, date: day(r.date), value: Number(r.value ?? 0) })).sort((a, z) => z.date.localeCompare(a.date) || z.value - a.value);
}

export function readingProblems(value: string, date: string, last?: number): string[] {
  const n = Number(value.replace(',', '.'));
  const out: string[] = [];
  if (!value.trim() || !Number.isFinite(n) || n < 0) out.push('Type the number on the odometer.');
  else if (last !== undefined && n < last) out.push(`The last reading was ${last}. This one can’t be lower.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) out.push('Type the date like 2026-12-05.');
  return out;
}

export const readingChange = (v: { id: number; name: string }, value: number, date: string): NewChange => ({
  label: `Odometer: ${v.name} ${value}`,
  model: 'fleet.vehicle.odometer',
  method: 'create',
  args: [{ vehicle_id: v.id, value, date }],
  already: { model: 'fleet.vehicle.odometer', domain: [['vehicle_id', '=', v.id], ['value', '=', value], ['date', '=', date]] },
});

// ---- Scan a code ----

export type CodeMatch = { kind: 'product'; id: number; templateId: number; name: string } | { kind: 'lot'; id: number; name: string; product: string } | null;

/** Matches a scanned code to a product barcode or a batch number. Nothing is changed. */
export async function findByCode(c: Client, code: string): Promise<CodeMatch> {
  const t = code.trim();
  if (!t) return null;
  const [p] = (await c.call('product.product', 'search_read', [[['barcode', '=', t]]], { fields: ['name', 'product_tmpl_id'], limit: 1 })) as Record<string, unknown>[];
  if (p) return { kind: 'product', id: p.id as number, templateId: m2oId(p.product_tmpl_id), name: String(p.name ?? '') };
  const [l] = (await c.call('stock.lot', 'search_read', [[['name', '=', t]]], { fields: ['name', 'product_id'], limit: 1 })) as Record<string, unknown>[];
  return l ? { kind: 'lot', id: l.id as number, name: String(l.name), product: nm(l.product_id) } : null;
}

// ---- Label text ----

/** Words for a label: name, batch, use-by, ingredients and allergens. Plain text to share. */
export async function labelText(c: Client, t: BatchTrace): Promise<string> {
  const names = [...new Set(t.madeIn.flatMap((m) => m.ingredients.map((i) => i.product)))];
  let allergens: string[] = [];
  if (names.length) {
    const prods = (await c.call('product.product', 'search_read', [[['name', 'in', names]]], { fields: ['name'] })) as { id: number }[];
    allergens = await loadAllergens(c, prods.map((p) => p.id)).catch(() => []);
  }
  return [t.lot.product, `Batch ${t.lot.name}`, t.lot.useBy ? `Use by ${t.lot.useBy}` : '', names.length ? `Ingredients: ${names.join(', ')}` : '', allergens.length ? allergens.join(', ') : ''].filter(Boolean).join('\n');
}
