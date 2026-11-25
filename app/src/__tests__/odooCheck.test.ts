import { OdooClient } from '../lib/odoo';
import { checkOdoo } from '../lib/odooCheck';
import { bakery, URL } from '../testing/fakeOdoo';

test('the connection check only reads, and says what to turn on in Odoo', async () => {
  const { odoo, owner } = bakery();
  odoo.tables['ir.module.module'] = odoo.tables['ir.module.module']!.filter((m) => m.name !== 'product_expiry');
  const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: owner.login }, 'key');
  const r = await checkOdoo(c);
  const line = (l: string) => r.lines.find((x) => x.label === l)!;
  expect(line('Odoo version')).toMatchObject({ ok: true, note: 'Odoo 19.0' });
  expect(line('Manufacturing (batches and recipes)').ok).toBe(true);
  expect(line('Batch numbers (lots)').ok).toBe(true);
  expect(line('Use-by dates')).toMatchObject({ ok: false, note: expect.stringContaining('Expiration Dates') });
  expect(odoo.calls.filter((x) => !['search_read', 'read', 'search_count', 'has_group', 'fields_get'].includes(x.method))).toEqual([]);
});
