/**
 * Lines that belong to a record (order lines, the parts of a production
 * batch, a product's packagings), edited as a list and saved once. Each line
 * is a small form made of the same field kinds as the other Odoo forms.
 * `rowChanges` sends only what differs: removals first, then edits, then
 * additions. The app never works out a price or an amount.
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { blankValue, changedValues, loadDraft, type Draft, type FieldDef } from './odooForm';
import type { OdooClient } from './odoo';
import type { NewChange } from './queue';

type Client = Pick<OdooClient, 'call'>;

export interface SubSpec {
  model: string;
  /** What one line is called, for the queue: "line", "part", "packaging". */
  noun: string;
  columns: FieldDef[];
  /** Columns that must have a value. */
  required: string[];
  /** The column that names a line on screen. */
  titleColumn: string;
  /** Domain that tells a line was already added (so it isn't added twice). */
  already: (d: Draft, base: Record<string, unknown>) => unknown[];
}

export interface SubRow {
  key: string;
  id: number | null;
  draft: Draft;
}

let seq = 0;
export const newRowKey = () => `r${++seq}`;

export const blankRow = (spec: SubSpec): SubRow => ({ key: newRowKey(), id: null, draft: Object.fromEntries(spec.columns.map((c) => [c.name, blankValue(c)])) });

export async function loadRows(c: Client, spec: SubSpec, domain: unknown[]): Promise<SubRow[]> {
  const have = (await c.call(spec.model, 'fields_get', [], { attributes: ['string'] })) as Record<string, unknown>;
  const cols = spec.columns.filter((f) => f.name in have);
  const ids = (await c.call(spec.model, 'search', [domain], { order: 'id asc' })) as number[];
  const rows: SubRow[] = [];
  for (const id of ids) rows.push({ key: `o${id}`, id, draft: await loadDraft(c, spec.model, id, cols) });
  return rows;
}

const title = (spec: SubSpec, d: Draft) => {
  const v = d[spec.titleColumn];
  return typeof v === 'string' ? v : v && !Array.isArray(v) && typeof v === 'object' ? v.name : '';
};

export const rowTitle = title;

export function rowProblems(spec: SubSpec, rows: SubRow[]): string[] {
  const out: string[] = [];
  for (const r of rows)
    for (const f of spec.columns) {
      const v = r.draft[f.name];
      const empty = v === '' || v === null || v === undefined;
      if (spec.required.includes(f.name) && empty) out.push(`${title(spec, r.draft) || `A ${spec.noun}`}: ${f.label} is needed.`);
      if ((f.kind === 'num' || f.kind === 'whole') && !empty && !Number.isFinite(Number(String(v).replace(',', '.')))) out.push(`${title(spec, r.draft) || `A ${spec.noun}`}: ${f.label} should be a number.`);
    }
  return out;
}

/**
 * What to send. `base` holds what a new line needs to belong to its record
 * (such as the order id). `createVia` makes a new line through the parent
 * record when Odoo wants it that way (a production batch's parts).
 */
export function rowChanges(spec: SubSpec, before: SubRow[], draft: SubRow[], label: string, base: Record<string, unknown>, createVia?: (vals: Record<string, unknown>) => Pick<NewChange, 'model' | 'method' | 'args'>): NewChange[] {
  const out: NewChange[] = [];
  const blank = Object.fromEntries(spec.columns.map((c) => [c.name, blankValue(c)])) as Draft;
  for (const b of before) if (!draft.some((d) => d.id === b.id)) out.push({ label: `${label}: remove ${title(spec, b.draft)}`, model: spec.model, method: 'unlink', args: [[b.id]] });
  for (const d of draft) {
    if (d.id === null) continue;
    const was = before.find((b) => b.id === d.id);
    if (!was) continue;
    const vals = changedValues(spec.columns, was.draft, d.draft);
    if (Object.keys(vals).length) out.push({ label: `${label}: ${title(spec, d.draft)}`, model: spec.model, method: 'write', args: [[d.id], vals] });
  }
  for (const d of draft) {
    if (d.id !== null) continue;
    const vals = changedValues(spec.columns, blank, d.draft, true);
    const make = createVia ? createVia(vals) : { model: spec.model, method: 'create', args: [{ ...base, ...vals }] };
    out.push({ label: `${label}: add ${title(spec, d.draft)}`, ...make, already: { model: spec.model, domain: spec.already(d.draft, base) } } as NewChange);
  }
  return out;
}

const relId = (v: unknown) => (v && !Array.isArray(v) && typeof v === 'object' ? (v as { id: number }).id : 0);
const numOf = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0;

const productCol = { name: 'product_id', label: 'Product', kind: 'one', relation: 'product.product' } as const;

/** A purchase order's lines. */
export const PO_LINES: SubSpec = {
  model: 'purchase.order.line',
  noun: 'line',
  columns: [
    { ...productCol, domain: [['purchase_ok', '=', true]] },
    { name: 'product_qty', label: 'Quantity', kind: 'num' },
    { name: 'product_uom_id', label: 'Unit', kind: 'one', relation: 'uom.uom' },
    { name: 'price_unit', label: 'Price for one', kind: 'num', hint: 'As the vendor quotes it. The app doesn’t work out prices or tax.' },
  ],
  required: ['product_id', 'product_qty'],
  titleColumn: 'product_id',
  already: (d, base) => [['order_id', '=', base.order_id], ['product_id', '=', relId(d.product_id)], ['product_qty', '=', numOf(d.product_qty)]],
};

/** The ingredients of one production batch. */
export const BATCH_PARTS: SubSpec = {
  model: 'stock.move',
  noun: 'ingredient',
  columns: [
    { ...productCol },
    { name: 'product_uom_qty', label: 'Amount needed', kind: 'num' },
    { name: 'product_uom', label: 'Unit', kind: 'one', relation: 'uom.uom' },
  ],
  required: ['product_id', 'product_uom_qty'],
  titleColumn: 'product_id',
  already: (d, base) => [['raw_material_production_id', '=', base.raw_material_production_id], ['product_id', '=', relId(d.product_id)], ['product_uom_qty', '=', numOf(d.product_uom_qty)]],
};

/** A product's packagings, such as "Pack of 6". */
export const PACKAGINGS: SubSpec = {
  model: 'product.packaging',
  noun: 'packaging',
  columns: [
    { name: 'name', label: 'Name', kind: 'text' },
    { name: 'qty', label: 'Contained quantity', kind: 'num' },
    { name: 'barcode', label: 'Barcode', kind: 'text' },
  ],
  required: ['name', 'qty'],
  titleColumn: 'name',
  already: (d, base) => [['product_id', '=', base.product_id], ['name', '=', String(d.name ?? '').trim()]],
};
