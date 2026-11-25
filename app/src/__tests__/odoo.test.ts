import { cleanUrl, guessDb, OdooClient, OdooError } from '../lib/odoo';
import { bakery, URL } from '../testing/fakeOdoo';

describe('the Odoo connection', () => {
  test('tidies the address that was typed', () => {
    expect(cleanUrl(' food.example.com/odoo/action-12 ')).toBe('https://food.example.com');
    expect(cleanUrl('https://food.hivemindjohnson.work/shop')).toBe('https://food.hivemindjohnson.work');
    expect(cleanUrl('http://10.0.0.5:8069/web#id=3')).toBe('http://10.0.0.5:8069');
    expect(guessDb('bakery.odoo.com')).toBe('bakery');
    expect(guessDb('food.example.com')).toBe('');
  });

  test('signs in and reads who the person is, their company, contact and the Odoo version', async () => {
    const { odoo, owner } = bakery();
    const c = await OdooClient.signIn(odoo.fetch, { url: 'test.food.example.com', db: 'food-test', login: owner.login }, 'key');
    expect(c.session).toMatchObject({ url: URL, db: 'food-test', uid: owner.id, name: 'Justin Owner', companyId: 1, partnerId: owner.partner, serverVersion: '19.0' });
    expect(await c.hasGroup('base.group_system')).toBe(true);
    expect(await c.hasGroup('mrp.group_mrp_user')).toBe(false);
  });

  test('says plainly what went wrong', async () => {
    const { odoo, owner } = bakery();
    await expect(OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: owner.login }, 'wrong')).rejects.toMatchObject({ kind: 'login', message: 'Wrong email, password or API key.' });
    await expect(OdooClient.signIn(odoo.fetch, { url: URL, db: 'nope', login: owner.login }, 'key')).rejects.toMatchObject({ kind: 'login' });
    await expect(OdooClient.signIn(odoo.fetch, { url: URL, db: '', login: owner.login }, 'key')).rejects.toMatchObject({ kind: 'login' });
    odoo.offline = true;
    const e = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: owner.login }, 'key').catch((x) => x);
    expect(e).toBeInstanceOf(OdooError);
    expect(e.kind).toBe('network');
  });

  test('a change Odoo refuses comes back as a server error with Odoo’s reason', async () => {
    const { odoo, owner } = bakery();
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: owner.login }, 'key');
    odoo.refuse['res.partner.write'] = 'That contact is archived.';
    await expect(c.call('res.partner', 'write', [[1], { name: 'x' }])).rejects.toMatchObject({ kind: 'server', message: 'That contact is archived.' });
  });
});
