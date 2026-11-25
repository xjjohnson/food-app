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
    'ir.module.module': ['mrp', 'stock', 'sale_management', 'website_sale', 'purchase', 'point_of_sale', 'hr', 'contacts', 'product_expiry'].map((name, i) => ({ id: i + 1, name, state: 'installed' })),
  };
  private nextId = 100;

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
      const raw = r[f];
      const val = Array.isArray(raw) && typeof raw[0] === 'number' && f !== 'category_ids' ? raw[0] : raw;
      if (op === '=') return v === false ? !val : val === v;
      if (op === 'in') return (v as unknown[]).includes(val);
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
      case 'search_count':
        return table.filter((r) => this.match(r, (args[0] as unknown[]) ?? [])).length;
      case 'read':
        return (args[0] as number[]).map((id) => table.find((r) => r.id === id)).filter(Boolean).map((r) => this.pick(r!, kw.fields as string[]));
      case 'create':
        return this.create(model, args[0] as Record<string, unknown>);
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
            } else r[k] = v;
          }
        }
        return true;
      }
      case 'message_post': {
        const [ids] = args as [number[]];
        return this.create('mail.message', { model, res_id: ids[0], body: kw.body });
      }
      case 'fields_get':
        return {};
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
