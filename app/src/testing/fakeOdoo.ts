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
    'res.company': [{ id: 1, name: 'Hivemind Bakery', logo_web: 'iVBORw0KGgoAAAANSUhEUg==', currency_id: [1, 'USD'], primary_color: '#C2185B', secondary_color: '#FFC107' }],
    'res.currency': [{ id: 1, name: 'USD', symbol: '$' }],
    'res.partner': [],
    'hr.employee': [],
    'mail.activity': [],
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
    'product.template': [],
    'product.category': [],
    'uom.uom': [],
    'account.tax': [],
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
  /** Fields a test says Odoo has, for models whose fields_get is built from rows. */
  declared: Record<string, string[]> = {};
  /** True to behave like Odoo 18 and older, whose name search takes `args` instead of `domain`. */
  oldNameSearch = false;
  /** Field details (label, type, relation) for fields_get with attributes, by model and field. */
  fieldInfo: Record<string, Record<string, { string?: string; type?: string; relation?: string }>> = {};
  productFields = ['expiration_time', 'free_qty'];
  templateFields = ['expiration_time', 'list_price'];
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
      const many = ['category_id', 'category_ids', 'lot_producing_ids', 'move_line_ids', 'move_raw_ids'].includes(f);
      const val = Array.isArray(raw) && typeof raw[0] === 'number' && !many ? raw[0] : raw;
      if (op === '=') return v === false ? !val : val === v;
      if (op === '!=') return v === false ? !!val && !(Array.isArray(val) && !val.length) : val !== v;
      if (op === 'child_of') return Array.isArray(v) ? (v as number[]).includes(val as number) : val === v;
      if (op === 'not in') return !(v as unknown[]).includes(val);
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

  /** Turns plain ids in product and unit fields into the [id, name] pairs Odoo sends back. */
  private pairs(vals: Record<string, unknown>): Record<string, unknown> {
    const out = { ...vals };
    if (typeof out.product_id === 'number') out.product_id = [out.product_id, String(this.tables['product.product']!.find((x) => x.id === out.product_id)?.name ?? '')];
    for (const f of ['product_uom_id', 'product_uom'])
      if (typeof out[f] === 'number') out[f] = [out[f], String((this.tables['uom.uom'] ?? []).find((x) => x.id === out[f])?.name ?? '')];
    return out;
  }

  private createBomLine(model: string, vals: Record<string, unknown>): number {
    const prod = this.tables['product.product']!.find((x) => x.id === vals.product_id);
    const uom = (this.tables['uom.uom'] ?? []).find((x) => x.id === vals.product_uom_id);
    const id = this.create(model, { ...vals, product_id: [vals.product_id, prod?.name ?? ''], ...(vals.product_uom_id ? { product_uom_id: [vals.product_uom_id, String(uom?.name ?? '')] } : {}) });
    const bom = this.tables['mrp.bom']!.find((b) => b.id === vals.bom_id);
    const field = model === 'mrp.bom.line' ? 'bom_line_ids' : 'byproduct_ids';
    if (bom) bom[field] = [...((bom[field] as number[]) ?? []), id];
    return id;
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
      case 'name_search': {
        // Odoo 19 takes `domain`; older Odoo takes `args`. Like Odoo, refuse the one it doesn't know.
        const wrong = this.oldNameSearch ? 'domain' : 'args';
        if (wrong in kw) throw { message: 'Odoo Server Error', data: { name: 'builtins.TypeError', message: `BaseModel.name_search() got an unexpected keyword argument '${wrong}'` } };
        const t = String(kw.name ?? '').toLowerCase();
        const dom = ((this.oldNameSearch ? kw.args : kw.domain) as unknown[] | undefined) ?? [];
        return table.filter((r) => this.match(r, dom)).filter((r) => String(r.display_name ?? r.name ?? '').toLowerCase().includes(t)).slice(0, (kw.limit as number) ?? 30).map((r) => [r.id, String(r.display_name ?? r.name ?? '')]);
      }
      case 'search_count':
        return table.filter((r) => this.match(r, (args[0] as unknown[]) ?? [])).length;
      case 'read':
        return (args[0] as number[]).map((id) => table.find((r) => r.id === id)).filter(Boolean).map((r) => this.pick(r!, kw.fields as string[]));
      case 'create': {
        const vals = { ...(args[0] as Record<string, unknown>) };
        if (model === 'mrp.production') return this.createBatch(vals);
        if (model === 'product.supplierinfo') {
          const id = this.create(model, { ...vals, partner_id: [vals.partner_id, String(this.tables['res.partner']!.find((x) => x.id === vals.partner_id)?.name ?? '')] });
          const t = this.tables['product.template']!.find((x) => x.id === vals.product_tmpl_id);
          if (t) t.seller_ids = [...((t.seller_ids as number[]) ?? []), id];
          return id;
        }
        if (model === 'mrp.bom.line' || model === 'mrp.bom.byproduct') return this.createBomLine(model, vals);
        if (model === 'purchase.order.line' || model === 'stock.move' || model === 'product.packaging') return this.create(model, this.pairs(vals));
        if (model === 'mrp.bom' && (vals.bom_line_ids || vals.byproduct_ids)) {
          const lines = (vals.bom_line_ids as [number, number, Record<string, unknown>][]) ?? [];
          const by = (vals.byproduct_ids as [number, number, Record<string, unknown>][]) ?? [];
          delete vals.bom_line_ids;
          delete vals.byproduct_ids;
          const id = this.create(model, { ...vals, bom_line_ids: [], byproduct_ids: [] });
          for (const l of lines) this.createBomLine('mrp.bom.line', { ...l[2], bom_id: id });
          for (const l of by) this.createBomLine('mrp.bom.byproduct', { ...l[2], bom_id: id });
          return id;
        }
        if (model === 'account.payment.register') return this.create(model, { ...vals, active_ids: ((kw.context as { active_ids?: number[] } | undefined)?.active_ids) ?? [] });
        if (model === 'purchase.order') {
          const lines = (vals.order_line as [number, number, Record<string, unknown>][] | undefined) ?? [];
          delete vals.order_line;
          const id = this.create(model, { state: 'draft', picking_ids: [], invoice_ids: [], order_line: [], ...vals });
          const po = this.tables[model]!.find((x) => x.id === id)!;
          po.name = po.name ?? `P${String(id).padStart(5, '0')}`;
          po.order_line = lines.map((l) => this.create('purchase.order.line', { ...this.pairs(l[2]), order_id: id, state: 'draft' }));
          return id;
        }
        return this.create(model, model === 'stock.scrap' ? { state: 'draft', ...vals } : vals);
      }
      case 'unlink': {
        const ids = args[0] as number[];
        this.tables[model] = table.filter((x) => !ids.includes(x.id));
        if (model === 'product.supplierinfo') for (const t of this.tables['product.template']!) t.seller_ids = ((t.seller_ids as number[]) ?? []).filter((x) => !ids.includes(x));
        if (model === 'mrp.bom.line') for (const b of this.tables['mrp.bom']!) b.bom_line_ids = ((b.bom_line_ids as number[]) ?? []).filter((x) => !ids.includes(x));
        if (model === 'mrp.bom.byproduct') for (const b of this.tables['mrp.bom']!) b.byproduct_ids = ((b.byproduct_ids as number[]) ?? []).filter((x) => !ids.includes(x));
        return true;
      }
      case 'copy': {
        const [ids, defaults] = args as [number[], Record<string, unknown>?];
        const src = table.find((x) => x.id === ids[0]);
        if (!src) throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.MissingError', message: 'Record does not exist' } };
        const { id: _id, ...rest } = src;
        void _id;
        return this.create(model, { ...rest, state: 'draft', ...(defaults ?? {}) });
      }
      case 'create_invoices': {
        const ctx = (kw.context ?? {}) as { active_ids?: number[] };
        for (const oid of ctx.active_ids ?? []) {
          const o = (this.tables['sale.order'] ??= []).find((x) => x.id === oid);
          if (!o) continue;
          const inv = this.create('account.move', { move_type: 'out_invoice', state: 'draft', payment_state: 'not_paid', invoice_date: new Date().toISOString().slice(0, 10), partner_id: o.partner_id, invoice_origin: o.name, amount_total: o.amount_total ?? 0 });
          o.invoice_ids = [...((o.invoice_ids as number[]) ?? []), inv];
        }
        return true;
      }
      case 'action_send_mail':
        return true;
      case 'action_launch':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) r.state = 'in_queue';
        return true;
      case 'action_confirm':
        if (model === 'sale.order') {
          for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
            if (r.state !== 'draft' && r.state !== 'sent') throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: `${r.name} is already confirmed.` } };
            r.state = 'sale';
          }
          return true;
        }
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
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          r.state = 'purchase';
          if (model === 'purchase.order') {
            const lines = this.tables['purchase.order.line']!.filter((l) => l.order_id === r.id);
            for (const l of lines) l.state = 'purchase';
            if (lines.length) {
              const pick = this.create('stock.picking', { name: `WH/IN/${String(r.id).padStart(5, '0')}`, origin: r.name, partner_id: r.partner_id, picking_type_code: 'incoming', state: 'assigned' });
              for (const l of lines) this.create('stock.move', { picking_id: pick, product_id: l.product_id, product_uom_qty: l.product_qty, purchase_line_id: [l.id, 'line'], location_id: [4, 'Vendors'], location_dest_id: [8, 'Stock'], move_line_ids: [] });
              r.picking_ids = [...((r.picking_ids as number[]) ?? []), pick];
            }
          }
        }
        return true;
      case 'action_create_invoice': {
        const out: number[] = [];
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          const done = (r.picking_ids as number[]).some((p) => this.tables['stock.picking']!.find((x) => x.id === p)?.state === 'done');
          if (!done) throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: 'There is nothing to invoice: receive the products first.' } };
          const total = this.tables['purchase.order.line']!.filter((l) => l.order_id === r.id).reduce((a, l) => a + (l.product_qty as number) * (l.price_unit as number ?? 0), 0);
          const id = this.create('account.move', { move_type: 'in_invoice', state: 'draft', payment_state: 'not_paid', partner_id: r.partner_id, invoice_origin: r.name, amount_total: total });
          r.invoice_ids = [...((r.invoice_ids as number[]) ?? []), id];
          out.push(id);
        }
        return { res_id: out[0] };
      }
      case 'action_post':
        for (const r of table.filter((x) => (args[0] as number[]).includes(x.id))) {
          if (!r.invoice_date) throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: 'The Bill/Refund date is required to validate this document.' } };
          r.state = 'posted';
        }
        return true;
      case 'action_create_payments': {
        const w = table.find((x) => x.id === (args[0] as number[])[0])!;
        for (const mid of w.active_ids as number[]) {
          const m = this.tables['account.move']!.find((x) => x.id === mid)!;
          m.payment_state = 'paid';
          this.create('account.payment', { move_id: mid, journal_id: w.journal_id, amount: m.amount_total });
        }
        return true;
      }
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
            } else if (k === 'supplier_taxes_id' && Array.isArray(v)) {
              for (const [op, , ids] of v as [number, number, number[]][]) if (op === 6) r.supplier_taxes_id = ids;
            } else if (k === 'move_line_ids' && Array.isArray(v)) {
              let cur = (r.move_line_ids as number[]) ?? [];
              for (const [op, a, vals] of v as [number, number, Record<string, unknown>][]) {
                if (op === 5) cur = [];
                if (op === 0) cur = [...cur, this.create('stock.move.line', { ...vals, move_id: [r.id, 'Move'], lot_id: [vals.lot_id, 'Lot'] })];
              }
              r.move_line_ids = cur;
            } else if (k === 'move_raw_ids' && Array.isArray(v)) {
              for (const [op, , vals] of v as [number, number, Record<string, unknown>][]) if (op === 0) this.create('stock.move', { ...this.pairs(vals), raw_material_production_id: r.id, state: 'draft' });
            } else if (k === 'lot_producing_ids' && Array.isArray(v)) {
              const cur = new Set((r.lot_producing_ids as number[]) ?? []);
              for (const [op, a, vals] of v as [number, number, Record<string, unknown>][]) {
                if (op === 0) cur.add(this.create('stock.lot', vals));
                if (op === 4) cur.add(a);
                if (op === 5) cur.clear();
                if (op === 6) {
                  cur.clear();
                  for (const x of (vals as unknown as number[]) ?? []) cur.add(x);
                }
              }
              if (cur.size > 1) throw { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.UserError', message: 'You cannot set more than 1 lot' } };
              r.lot_producing_ids = [...cur];
            } else if (k === 'category_id' && Array.isArray(v) && Array.isArray(v[0]) && (v[0] as unknown[])[0] === 4) {
              r[k] = [...new Set([...(Array.isArray(r[k]) ? (r[k] as number[]) : []), ...(v as [number, number][]).filter((x) => x[0] === 4).map((x) => x[1])])];
            } else if (Array.isArray(v) && Array.isArray(v[0]) && (v[0] as unknown[])[0] === 6) r[k] = (v[0] as unknown[])[2];
            else r[k] = v;
          }
        }
        return true;
      }
      case 'action_feedback': {
        const [ids] = args as [number[]];
        this.tables[model] = (this.tables[model] ?? []).filter((r) => !ids.includes(r.id));
        return true;
      }
      case 'message_post': {
        const [ids] = args as [number[]];
        return this.create('mail.message', { model, res_id: ids[0], body: kw.body });
      }
      case 'fields_get': {
        if (model === 'mrp.production') return Object.fromEntries(this.batchFields.map((f) => [f, {}]));
        if (model === 'product.product') return Object.fromEntries([...this.productFields, ...(this.declared[model] ?? [])].map((f) => [f, {}]));
        if (model === 'product.template') return Object.fromEntries([...this.templateFields, ...(this.declared[model] ?? []), ...table.flatMap((r) => Object.keys(r))].map((f) => [f, this.fieldInfo[model]?.[f] ?? {}]));
        return Object.fromEntries([...(this.declared[model] ?? []), ...table.flatMap((r) => Object.keys(r))].map((f) => [f, {}]));
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
