import { OdooClient } from '../lib/odoo';
import { canSee, listPeople, readMyRoles, roleOfTag, rolesFromTags, saveRoles } from '../lib/roles';
import { bakery, URL } from '../testing/fakeOdoo';

const signIn = (odoo: ReturnType<typeof bakery>['odoo'], login: string) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login }, 'key');

describe('roles', () => {
  test('tag names are matched loosely, and other tags are ignored', () => {
    expect(roleOfTag('Shipping & Packaging')).toBe('shipping');
    expect(roleOfTag(' packaging ')).toBe('shipping');
    expect(roleOfTag('production')).toBe('production');
    expect(roleOfTag('Regular hours')).toBeNull();
    expect(rolesFromTags(['Sales', 'Regular hours'], false)).toEqual({ owner: false, production: false, inventory: false, sales: true, shipping: false });
  });

  test('an Odoo administrator is always Owner, and the owner sees every area', () => {
    const r = rolesFromTags([], true);
    expect(r.owner).toBe(true);
    expect(canSee(r, 'production')).toBe(true);
    expect(canSee(rolesFromTags(['Production'], false), 'sales')).toBe(false);
  });

  test('staff roles are read from their own Employee, through the public profile when that is all they can read', async () => {
    const { odoo, baker } = bakery();
    const mine = await readMyRoles(await signIn(odoo, baker.login));
    expect(mine).toMatchObject({ admin: false, hasEmployee: true });
    expect(mine.roles).toMatchObject({ production: true, owner: false, sales: false });
    expect(odoo.calls.some((c) => c.model === 'hr.employee.public')).toBe(true);
  });

  test('a login with no Employee has no role, and says why', async () => {
    const { odoo } = bakery();
    const u = odoo.addUser({ login: 'new@example.com' });
    const mine = await readMyRoles(await signIn(odoo, u.login));
    expect(mine.hasEmployee).toBe(false);
    expect(Object.values(mine.roles).some(Boolean)).toBe(false);
  });

  test('the owner sets roles as Employee tags, keeps other tags, and makes a tag only when first needed', async () => {
    const { odoo, owner } = bakery();
    const c = await signIn(odoo, owner.login);
    const bea = (await listPeople(c)).find((p) => p.name === 'Bea Baker')!;
    expect(bea.login).toBe('baker@example.com');
    const tagsBefore = odoo.tables['hr.employee.category']!.length;
    const got = await saveRoles(c, bea.id, { ...bea.roles, production: false, shipping: true });
    expect(got).toMatchObject({ production: false, shipping: true });
    const row = odoo.tables['hr.employee']!.find((e) => e.id === bea.id)!;
    const names = (row.category_ids as number[]).map((id) => odoo.tables['hr.employee.category']!.find((t) => t.id === id)!.name);
    expect(names.sort()).toEqual(['Regular hours', 'Shipping and packaging']);
    expect(odoo.tables['hr.employee.category']!.length).toBe(tagsBefore + 1);
    // Taking a role off never deletes the tag itself.
    await saveRoles(c, bea.id, { ...got, shipping: false });
    expect(odoo.tables['hr.employee.category']!.some((t) => t.name === 'Shipping and packaging')).toBe(true);
  });

  test('nothing is written when nothing changed', async () => {
    const { odoo, owner } = bakery();
    const c = await signIn(odoo, owner.login);
    const bea = (await listPeople(c)).find((p) => p.name === 'Bea Baker')!;
    await saveRoles(c, bea.id, bea.roles);
    expect(odoo.calls.filter((x) => x.method === 'write' || x.method === 'create')).toEqual([]);
  });
});
