/**
 * Who does what in the app: Owner, Production, Inventory, Sales, and
 * Shipping and packaging. One person can hold several.
 *
 * Roles live in Odoo, as tags on the person's Employee record (Employees app,
 * the "Tags" field, model hr.employee.category). The app reads them through
 * the Employee linked to the signed-in user. Odoo administrators (Settings
 * access) are always Owner, so the owner can never lock themselves out.
 *
 * A role only decides which screens the app shows. What a person may change
 * is still decided by their Odoo access rights; Odoo refuses anything else.
 *
 * The app never creates or changes tags by itself. In the management area the
 * owner can tick roles for a person, which adds or removes that tag on their
 * Employee in Odoo (and makes the tag the first time it's used).
 *
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { m2oId, type OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call' | 'session' | 'hasGroup'>;

export type RoleId = 'owner' | 'production' | 'inventory' | 'sales' | 'shipping';

export const ROLES: { id: RoleId; label: string; tag: string; detail: string; also: string[] }[] = [
  { id: 'owner', label: 'Owner', tag: 'Owner', detail: 'Everything, plus the management area', also: [] },
  { id: 'production', label: 'Production', tag: 'Production', detail: "Today's batches, ingredients used, batch numbers and use-by dates", also: [] },
  { id: 'inventory', label: 'Inventory', tag: 'Inventory', detail: 'Stock counts, moving stock, low stock and close to use-by', also: [] },
  { id: 'sales', label: 'Sales', tag: 'Sales', detail: 'Market sales, customers and past orders', also: [] },
  { id: 'shipping', label: 'Shipping and packaging', tag: 'Shipping and packaging', detail: 'Packing website orders, delivery and pickup', also: ['Shipping', 'Packaging'] },
];

export const ROLE_IDS: RoleId[] = ROLES.map((r) => r.id);

export type Roles = Record<RoleId, boolean>;

export const NO_ROLES: Roles = { owner: false, production: false, inventory: false, sales: false, shipping: false };

const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');

/** Which role a tag name means, if any. Case and "&" vs "and" don't matter. */
export function roleOfTag(name: string): RoleId | null {
  const n = norm(name);
  for (const r of ROLES) if (norm(r.tag) === n || r.also.some((a) => norm(a) === n)) return r.id;
  return null;
}

export function rolesFromTags(names: string[], admin: boolean): Roles {
  const out: Roles = { ...NO_ROLES };
  for (const n of names) {
    const r = roleOfTag(n);
    if (r) out[r] = true;
  }
  if (admin) out.owner = true;
  return out;
}

/** What the screens use: the owner sees everything. */
export function canSee(roles: Roles, area: RoleId): boolean {
  return roles.owner || roles[area];
}

export const hasAnyRole = (roles: Roles) => ROLE_IDS.some((r) => roles[r]);

/** "Production, Sales" for the screen. */
export function roleNames(roles: Roles): string {
  return ROLES.filter((r) => roles[r.id]).map((r) => r.label).join(', ');
}

export interface MyRoles {
  roles: Roles;
  /** An Odoo administrator: always Owner. */
  admin: boolean;
  /** False when this login has no Employee record, so roles can't be read from tags. */
  hasEmployee: boolean;
  /** False when the Employees app isn't there or this person can't read it. */
  employeesApp: boolean;
}

async function tagNames(c: Client, ids: number[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = (await c.call('hr.employee.category', 'read', [ids], { fields: ['name'] })) as { name?: unknown }[];
  return rows.map((r) => (typeof r.name === 'string' ? r.name : '')).filter(Boolean);
}

/**
 * The signed-in person's roles. Reads their own Employee (in their company)
 * through hr.employee.public when they can't read hr.employee, since staff
 * often can only see the public profile.
 */
export async function readMyRoles(c: Client): Promise<MyRoles> {
  const admin = await c.hasGroup('base.group_system');
  for (const model of ['hr.employee', 'hr.employee.public']) {
    try {
      const rows = (await c.call(model, 'search_read', [[['user_id', '=', c.session.uid]]], { fields: ['category_ids', 'company_id'], limit: 5 })) as { category_ids?: unknown; company_id?: unknown }[];
      const mine = rows.find((r) => !c.session.companyId || m2oId(r.company_id) === c.session.companyId) ?? rows[0];
      if (!mine) return { roles: rolesFromTags([], admin), admin, hasEmployee: false, employeesApp: true };
      const ids = Array.isArray(mine.category_ids) ? (mine.category_ids as number[]) : [];
      return { roles: rolesFromTags(await tagNames(c, ids), admin), admin, hasEmployee: true, employeesApp: true };
    } catch {
      // No rights on this model: try the public profile next.
    }
  }
  return { roles: rolesFromTags([], admin), admin, hasEmployee: false, employeesApp: false };
}

/* ------------------------------------------------ Owner: people and roles */

export interface Person {
  /** hr.employee id. */
  id: number;
  name: string;
  /** The Odoo login linked to this employee, '' when none (they can't sign in to the app). */
  login: string;
  roles: Roles;
}

/** Every active employee and the roles their tags give. Owner only (needs Employees rights). */
export async function listPeople(c: Client): Promise<Person[]> {
  const rows = (await c.call('hr.employee', 'search_read', [[['active', '=', true]]], { fields: ['name', 'category_ids', 'user_id'], order: 'name asc', limit: 300 })) as Record<string, unknown>[];
  const allTagIds = [...new Set(rows.flatMap((r) => (Array.isArray(r.category_ids) ? (r.category_ids as number[]) : [])))];
  const tags = allTagIds.length ? ((await c.call('hr.employee.category', 'read', [allTagIds], { fields: ['name'] })) as { id: number; name?: unknown }[]) : [];
  const tagName = new Map(tags.map((t) => [t.id, typeof t.name === 'string' ? t.name : '']));
  const userIds = [...new Set(rows.map((r) => m2oId(r.user_id)).filter(Boolean))];
  const users = userIds.length ? ((await c.call('res.users', 'read', [userIds], { fields: ['login'] })) as { id: number; login?: unknown }[]) : [];
  const loginOf = new Map(users.map((u) => [u.id, typeof u.login === 'string' ? u.login : '']));
  return rows
    .map((r) => ({
      id: r.id as number,
      name: typeof r.name === 'string' ? r.name : '',
      login: loginOf.get(m2oId(r.user_id)) ?? '',
      roles: rolesFromTags((Array.isArray(r.category_ids) ? (r.category_ids as number[]) : []).map((id) => tagName.get(id) ?? ''), false),
    }))
    .filter((p) => p.name);
}

/** The tag id for a role, making the tag in Odoo only when `create` is true and it isn't there. */
async function tagFor(c: Client, role: RoleId, create: boolean): Promise<number[]> {
  const info = ROLES.find((r) => r.id === role)!;
  const names = [info.tag, ...info.also];
  const found = (await c.call('hr.employee.category', 'search_read', [[['name', 'in', names]]], { fields: ['name'] })) as { id: number; name?: unknown }[];
  const ids = found.filter((t) => typeof t.name === 'string' && roleOfTag(t.name) === role).map((t) => t.id);
  if (ids.length || !create) return ids;
  const id = (await c.call('hr.employee.category', 'create', [{ name: info.tag }])) as number;
  return typeof id === 'number' ? [id] : [];
}

/**
 * Sets one person's roles by adding or removing their role tags in Odoo. Only
 * the roles that change are touched; other tags on the employee stay. Reads
 * the person back afterwards so a change Odoo quietly refused isn't reported
 * as saved. Returns the roles Odoo now shows.
 */
export async function saveRoles(c: Client, employeeId: number, want: Roles): Promise<Roles> {
  const [row] = (await c.call('hr.employee', 'read', [[employeeId]], { fields: ['category_ids'] })) as { category_ids?: unknown }[];
  const held = new Set(Array.isArray(row?.category_ids) ? (row!.category_ids as number[]) : []);
  const names = await tagNames(c, [...held]);
  const now = rolesFromTags(names, false);
  const cmds: [number, number][] = [];
  for (const id of ROLE_IDS) {
    if (want[id] === now[id]) continue;
    const tags = await tagFor(c, id, want[id]);
    if (want[id]) cmds.push([4, tags[0]!]);
    else for (const t of tags) if (held.has(t)) cmds.push([3, t]);
  }
  if (cmds.length) await c.call('hr.employee', 'write', [[employeeId], { category_ids: cmds }]);
  const [after] = (await c.call('hr.employee', 'read', [[employeeId]], { fields: ['category_ids'] })) as { category_ids?: unknown }[];
  const got = rolesFromTags(await tagNames(c, Array.isArray(after?.category_ids) ? (after!.category_ids as number[]) : []), false);
  for (const r of ROLES) if (got[r.id] !== want[r.id]) throw new Error(`Odoo did not keep the ${r.label} change. Check the employee's Tags in Odoo's Employees app.`);
  return got;
}
