/**
 * A small pretend Odoo 19 for tests: answers /jsonrpc like the real one for
 * sign-in, version and the model calls the app makes (search_read, read,
 * search_count, create, write, has_group, message_post, fields_get), over
 * plain in-memory tables. `offline = true` makes every call fail like no signal.
 */
import type { Fetch } from '../lib/odoo';

type Rec = Record<string, unknown> & { id: number };

export interface FakeUser {
  id: number;
  login: string;
  key: string;
  name: string;
  groups: string[];
  company: number;
  partner: number;
}

export class FakeOdoo {
  db = 'food-test';
  offline = false;
  version = '19.0';
  /** Called for every model call, to look at what the app sent. */
  calls: { model: string; method: string; args: unknown[]; kwargs: Record<string, unknown>; uid: number }[] = [];
  /** Model calls Odoo refuses with this message: "model.method" -> message. */
  refuse: Record<string, string> = {};
  users: FakeUser[] = [];
  tables: Record<string, Rec[]> = {
    'res.company': [{ id: 1, name: 'Hivemind Bakery', logo_web: 'iVBORw0KGgoAAAANSUhEUg==', primary_color: '#C2185B', secondary_color: '#FFC107' }],
    'res.partner': [],
    'hr.employee': [],
    'hr.employee.category': [],
    'mail.message': [],
    'mrp.bom': [],
    'mrp.bom.line': [],
    'mrp.production': [],
    'stock.move': [],
    'stock.lot': [],
    'stock.picking': [],
    'stock.move.line': [],
    'stock.quant': [],
    'stock.scrap': [],
    'pos.config': [],
    'pos.payment.method': [],
    'stock.warehouse.orderpoint': [],
    'purchase.order': [],
    'product.supplierinfo': [],
    'product.product': [],
    'ir.module.module': ['mrp', 'stock', 'sale_management', 'website_sale', 'purchase', 'point_of_sale', 'hr', 'contacts', 'product_expiry'].map((name, i) => ({ id: i + 1, name, state: 'installed' })),
  };
  /** Which of these fields this pretend Odoo has (to test an Odoo that lacks one). */
  batchFields = ['lot_producing_ids', 'qty_producing', 'move_raw_ids'];
  productFields = ['expiration_time', 'free_qty'];
  private nextId = 100;

  /** A batch (manufacturing order) made from a recipe: draft, with one ingredient line per recipe line. */
  private createBatch(vals: Record<string, unknown>): number {
    const bom = this.tables['mrp.bom']!.find((b) => b.id === vals.bom_id);
    const n = this.tables['mrp.production']!.length + 1;
    const id = this.create('mrp.production', { name: `WH/MO/${String(n).padStart(5, '0')}`, state: 'draft', ...vals, product_id: [vals.product_id, 'Product'] });
    const mo = this.tables['mrp.production']!.find((r) => r.id === id)!;
    const scale = (vals.product_qty as number) / ((bom?.product_qty as number) || 1);
    const moves: number[] = [];
    for (const l of this.tables['mrp.bom.line']!.filter((x) => x.bom_id === bom?.id))
      moves.push(this.create('stock.move', { raw_material_production_id: id, product_id: l.product_id, product_uom_qty: (l.product_qty as number) * scale, state: 'draft' }));
    mo.move_raw_ids = moves;
    return id;
  }

  addUser(u: Partial<FakeUser> & { login: string }): FakeUser {
    const id = u.id ?? this.nextId++;
    const partner = this.create('res.partner', { name: u.name ?? u.login });
    const user: FakeUser = { id, key: 'key', name: u.login, groups: [], company: 1, partner, ...u };
    this.users.push(user);
    return user;
  }

  /** An employee linked to the user, with these tag names (made if missing). */
  addEmployee(name: string, userId: number | false, tags: string[] = []): number {
    const ids = tags.map((t) => this.tables['hr.employee.category']!.find((x) => x.name === t)?.id ?? this.create('hr.employee.category', { name: t }));
    return this.create('hr.employee', { name, user_id: userId ? [userId, name] : false, category_ids: ids, company_id: [1, 'Hivemind Bakery'], active: true });
  }

  create(model: string, vals: Record<string, unknown>): number {
    const id = this.nextId++;
    (this.tables[model] ??= []).push({ id, ...vals });
    return id;
  }

  private match(r: Rec, domain: unknown[]): boolean {
    return domain.every((d) => {
      if (!Array.isArray(d)) return true;
      const [f, op, v] = d as [string, string, unknown];
      if (f.includes('.')) return true; // paths through other tables aren't pretended
      const raw = r[f];
      const many = ['category_ids', 'lot_producing_ids', 'move_line_ids', 'move_raw_ids'].includes(f);
      const val = Array.isArray(raw) && typeof raw[0] === 'number' && !many ? raw[0] : raw;
      if (op === '=') return v === false ? !val : val === v;
      if (op === '!=') return v === false ? !!val && !(Array.isArray(val) && !val.length) : val !== v;
      if (op === 'in') return many && Array.isArray(val) ? (val as unknown[]).some((x) => (v as unknown[]).includes(x)) : (v as unknown[]).includes(val);
      if (op === '<=' || op === '<' || op === '>' || op === '>=') {
        if (val === false || val === undefined || val === null) return false;
        const a = val as string | number;
        const b = v as string | number;
        return op === '<=' ? a <= b : op === '<' ? a < b : op === '>' ? a > b : a >= b;
      }
      if (op === 'ilike') return typeof val === 'string' && val.toLowerCase().includes(String(v).toLowerCase());
      return true;
    });
  }

  private pick(r: Rec, fields?: string[]) {
    if (!fields) return { ...r };
    const out: Rec = { id: r.id };
    for (const f of fields) out[f] = r[f] ?? false;
    return out;
  }

  private model(uid: number, model: string, method: string, args: unknown[], kw: Record<string, unknown>): unknown {
    this.calls.push({ model, method, args, kwargs: kw, uid });
    const why = this.refuse[`${model}.${method}`];
    if (why) throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: why } };
    const user = this.users.find((u) => u.id === uid)!;
    if (model === 'res.users') {
      if (method === 'has_group') return user.groups.includes(args[1] as string);
      if (method === 'read')
        return (args[0] as number[]).map((id) => {
          const u = this.users.find((x) => x.id === id)!;
          return { id, name: u.name, login: u.login, company_id: [u.company, 'Hivemind Bakery'], partner_id: [u.partner, u.name] };
        });
    }
    if (model === 'hr.employee' && !user.groups.includes('hr.group_hr_user') && !user.groups.includes('base.group_system')) {
      throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.AccessError', message: 'You are not allowed to access Employee.' } };
    }
    const table = model === 'hr.employee.public' ? this.tables['hr.employee']! : (this.tables[model] ??= []);
    switch (method) {
      case 'search_read':
        return table.filter((r) => this.match(r, (args[0] as unknown[]) ?? [])).slice(0, (kw.limit as number) ?? 1e9).map((r) => this.pick(r, kw.fields as string[]));
      case 'search':
        return table.filter((r) => this.match(r, (args[0] as unknown[]) ?? [])).map((r) => r.id);
      case 'search_count':
        return table.filter((r) => this.match(r, (args[0] as unknown[]) ?? [])).length;
      case 'read':
        return (args[0] as number[]).map((id) => table.find((r) => r.id === id)).filter(Boolean).map((r) => this.pick(r!, kw.fields as string[]));
      case 'create': {
        const vals = { ...(args[0] as Record<string, unknown>) };
        if (model === 'mrp.production') return this.createBatch(vals);
        return this.create(model, model === 'stock.scrap' || model === 'purchase.order' ? { state: 'draft', ...vals } : vals);
      }
      case 'action_confirm':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          if (r.state !== 'draft') throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: `${r.name} is already confirmed.` } };
          r.state = 'confirmed';
          for (const m of this.tables['stock.move']!.filter((x) => x.raw_material_production_id === r.id)) {
            const p = this.tables['product.product']!.find((x) => x.id === (Array.isArray(m.product_id) ? m.product_id[0] : m.product_id))!;
            m.state = ((p.free_qty as number) ?? 0) >= (m.product_uom_qty as number) ? 'assigned' : 'confirmed';
          }
        }
        return true;
      case 'button_confirm':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) r.state = 'purchase';
        return true;
      case 'action_apply_inventory':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          r.quantity = r.inventory_quantity;
          r.inventory_quantity_set = false;
        }
        return true;
      case 'action_validate':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          r.state = 'done';
          const q = this.tables['stock.quant']!.find((x) => (Array.isArray(x.lot_id) ? x.lot_id[0] : x.lot_id) === (Array.isArray(r.lot_id) ? r.lot_id[0] : r.lot_id));
          if (q) q.quantity = (q.quantity as number) - (r.scrap_qty as number);
        }
        return true;
      case 'button_validate':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          if (r.state === 'done') throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: `${r.name} is already done.` } };
          r.state = 'done';
          for (const m of this.tables['stock.move']!.filter((x) => x.picking_id === r.id))
            for (const l of this.tables['stock.move.line']!.filter((x) => (m.move_line_ids as number[] | undefined)?.includes(x.id))) {
              const q = this.tables['stock.quant']!.find((x) => (Array.isArray(x.lot_id) ? x.lot_id[0] : x.lot_id) === (Array.isArray(l.lot_id) ? l.lot_id[0] : l.lot_id));
              if (q) q.quantity = (q.quantity as number) - (l.quantity as number);
            }
        }
        return true;
      case 'button_mark_done':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          if (!(r.lot_producing_ids as number[] | undefined)?.length) throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: 'Please enter a lot or serial number for the product.' } };
          r.state = 'done';
        }
        return true;
      case 'write': {
        const [ids, vals] = args as [number[], Record<string, unknown>];
        for (const r of table.filter((x) => ids.includes(x.id))) {
          for (const [k, v] of Object.entries(vals)) {
            if (k === 'category_ids' && Array.isArray(v)) {
              let cur = new Set((r.category_ids as number[]) ?? []);
              for (const [op, id] of v as [number, number][]) {
                if (op === 4) cur.add(id);
                if (op === 3) cur.delete(id);
              }
              r.category_ids = [...cur];
            } else if (k === 'move_line_ids' && Array.isArray(v)) {
              let cur = (r.move_line_ids as number[]) ?? [];
              for (const [op, a, vals] of v as [number, number, Record<string, unknown>][]) {
                if (op === 5) cur = [];
                if (op === 0) cur = [...cur, this.create('stock.move.line', { ...vals, move_id: [r.id, 'Move'], lot_id: [vals.lot_id, 'Lot'] })];
              }
              r.move_line_ids = cur;
            } else if (k === 'lot_producing_ids' && Array.isArray(v)) {
              const cur = new Set((r.lot_producing_ids as number[]) ?? []);
              for (const [op, a, vals] of v as [number, number, Record<string, unknown>][]) {
                if (op === 0) cur.add(this.create('stock.lot', vals));
                if (op === 4) cur.add(a);
              }
              r.lot_producing_ids = [...cur];
            } else r[k] = v;
          }
        }
        return true;
      }
      case 'message_post': {
        const [ids] = args as [number[]];
        return this.create('mail.message', { model, res_id: ids[0], body: kw.body });
      }
      case 'fields_get': {
        if (model === 'mrp.production') return Object.fromEntries(this.batchFields.map((f) => [f, {}]));
        if (model === 'product.product') return Object.fromEntries(this.productFields.map((f) => [f, {}]));
        return {};
      }
    }
    throw { message: 'Odoo Server Error', data: { name: 'AttributeError', message: `The method ${method} does not exist on ${model}` } };
  }

  fetch: Fetch = async (_url, init) => {
    if (this.offline) throw new TypeError('Network request failed');
    const { params } = JSON.parse(init.body) as { params: { service: string; method: string; args: unknown[] } };
    const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    try {
      if (params.service === 'common' && params.method === 'version') return reply({ result: { server_version: this.version } });
      if (params.service === 'common' && params.method === 'authenticate') {
        const [db, login, key] = params.args as string[];
        if (db !== this.db) return reply({ error: { message: 'Odoo Server Error', data: { message: `database "${db}" does not exist` } } });
        const u = this.users.find((x) => x.login === login && x.key === key);
        return reply({ result: u ? u.id : false });
      }
      const [db, uid, key, model, method, args, kwargs] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
      const u = this.users.find((x) => x.id === uid && x.key === key);
      if (db !== this.db || !u) return reply({ error: { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.AccessDenied', message: 'Access Denied' } } });
      return reply({ result: this.model(uid, model, method, args ?? [], kwargs ?? {}) });
    } catch (e) {
      return reply({ error: e });
    }
  };
}

/** A fake Odoo with an owner (Odoo administrator, also an Employee) and a production worker. */
export function bakery() {
  const odoo = new FakeOdoo();
  const owner = odoo.addUser({ login: 'justin@example.com', name: 'Justin Owner', groups: ['base.group_system', 'stock.group_production_lot'] });
  const baker = odoo.addUser({ login: 'baker@example.com', name: 'Bea Baker', groups: ['mrp.group_mrp_user'] });
  odoo.addEmployee('Justin Owner', owner.id, ['Owner']);
  odoo.addEmployee('Bea Baker', baker.id, ['Production', 'Regular hours']);
  odoo.addEmployee('Sam Seller', false, []);
  return { odoo, owner, baker };
}

export const URL = 'https://test.food.example.com';
