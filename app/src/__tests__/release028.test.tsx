import AsyncStorage from '@react-native-async-storage/async-storage';
import { draftChange, newsletterBody, newsletterProblems, sendNewsletter, loadDrafts } from '../lib/newsletter';
import { OdooClient } from '../lib/odoo';
import { saveOrQueue } from '../lib/queue';
import { closeDayChange, feedbackChange, isClosed, loadFeedback, loadReferrals, loadShop, loadSpecials, loadWebOrders, shopSwitch, specialChange, specialProblems, tagReferral } from '../lib/shop';
import { loadSettings } from '../lib/appSettings';
import { sendQueue, enqueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('shop switches and orders', () => {
  test('a product’s own switches are saved, and the list shows them', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const t = odoo.create('product.template', { name: 'Grape jelly', sale_ok: true, list_price: 6, is_published: false, allow_out_of_stock_order: false });
    odoo.declared['product.template'] = ['is_published', 'allow_out_of_stock_order'];
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, shopSwitch(t, 'Grape jelly', 'is_published', true));
    const rows = await loadShop(c);
    expect(rows).toEqual([{ id: t, name: 'Grape jelly', price: 6, onShop: true, sellWhenOut: false }]);
  });

  test('new website orders are only the shop’s, from the last days', async () => {
    const { odoo } = bakery();
    const now = new Date(2026, 10, 26, 12);
    const mk = (name: string, web: unknown, date: string) => odoo.create('sale.order', { name, website_id: web, state: 'sale', date_order: `${date} 10:00:00`, amount_total: 9, partner_id: [5, 'Anna'] });
    mk('S1', [1, 'Shop'], '2026-11-25');
    mk('S2', false, '2026-11-25');
    mk('S3', [1, 'Shop'], '2026-11-01');
    expect((await loadWebOrders(await client(odoo), 3, now)).map((o) => o.name)).toEqual(['S1']);
  });
});

describe('specials', () => {
  test('problems are said plainly and the program has one code and one percent for Odoo to apply', async () => {
    expect(specialProblems({ name: '', code: 'a b', percentText: '150', from: '2026-12-10', to: '2026-12-01' })).toHaveLength(4);
    expect(specialProblems({ name: 'Holiday', code: 'HOLIDAY10', percentText: '10', from: '', to: '' })).toEqual([]);
    const c = specialChange({ name: 'Holiday', code: 'HOLIDAY10', percent: 10, from: '2026-12-01', to: '2026-12-31', maxUses: 50 });
    const v = c.args[0] as Record<string, unknown>;
    expect(v).toMatchObject({ program_type: 'promo_code', limit_usage: true, max_usage: 50, date_from: '2026-12-01' });
    expect(JSON.stringify(v.rule_ids)).toContain('HOLIDAY10');
    expect(JSON.stringify(v.reward_ids)).toContain('"discount":10');
  });

  test('specials list shows the code from the rule', async () => {
    const { odoo } = bakery();
    const r = odoo.create('loyalty.rule', { code: 'SAVE5' });
    odoo.create('loyalty.program', { name: 'Five off', program_type: 'promo_code', active: true, date_from: '2026-12-01', rule_ids: [r] });
    expect(await loadSpecials(await client(odoo))).toEqual([{ id: expect.any(Number), name: 'Five off', active: true, from: '2026-12-01', to: '', code: 'SAVE5' }]);
  });
});

describe('closed days, feedback and referrals', () => {
  test('a closed day is a setting that reads back, and can be opened again', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, closeDayChange('2026-12-25', true));
    expect(isClosed(await loadSettings(c), '2026-12-25')).toBe(true);
    await saveOrQueue(c, AsyncStorage, DB, 1, closeDayChange('2026-12-25', false));
    expect(isClosed(await loadSettings(c), '2026-12-25')).toBe(false);
  });

  test('feedback is one note with the stars, posted once', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const o = odoo.create('sale.order', { name: 'S9' });
    const c = await client(odoo);
    const change = feedbackChange(o, 'S9', 4, 'Loved the jam');
    await enqueue(AsyncStorage, DB, 1, change);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['mail.message']!.filter((m) => m.model === 'sale.order')).toHaveLength(1);
    expect(await loadFeedback(c, o)).toBe(4);
  });

  test('referral tag is made once, and the list counts the referred customers’ orders', async () => {
    const { odoo } = bakery();
    const anna = odoo.create('res.partner', { name: 'Anna', category_id: [] });
    const ben = odoo.create('res.partner', { name: 'Ben', category_id: [] });
    const c = await client(odoo);
    await tagReferral(c, ben, 'Anna');
    await tagReferral(c, anna, 'Anna');
    expect(odoo.tables['res.partner.category']!.filter((t) => t.name === 'Referred by Anna')).toHaveLength(1);
    odoo.create('sale.order', { partner_id: [ben, 'Ben'], state: 'sale' });
    const list = await loadReferrals(c, 'Anna');
    expect(list.find((r) => r.name === 'Ben')).toMatchObject({ orders: 1 });
  });
});

describe('newsletter', () => {
  test('the body has the words and the picked products with Odoo prices; nothing is sent by saving', async () => {
    expect(newsletterBody('Hello <you>\nNew jams!', [{ name: 'Plum & Fig', price: 7 }])).toBe('<p>Hello &lt;you&gt;</p><p>New jams!</p><p><b>New for you</b></p><ul><li>Plum &amp; Fig, 7.00</li></ul>');
    expect(newsletterProblems('', '', [])).toHaveLength(3);
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    const change = draftChange('Fall jams', '<p>Hi</p>', [3], 99);
    await enqueue(AsyncStorage, DB, 1, change);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    const made = odoo.tables['mailing.mailing']!;
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ subject: 'Fall jams', mailing_model_id: 99 });
    expect(odoo.calls.some((x) => x.method === 'action_launch')).toBe(false);
  });

  test('sending launches a draft once and refuses one that was already sent', async () => {
    const { odoo } = bakery();
    const list = odoo.create('mailing.list', { name: 'Customers', contact_count: 40 });
    const d = odoo.create('mailing.mailing', { subject: 'Fall jams', state: 'draft', contact_list_ids: [list] });
    const c = await client(odoo);
    expect((await loadDrafts(c))[0]).toMatchObject({ subject: 'Fall jams', people: 40 });
    await sendNewsletter(c, d);
    expect(odoo.calls.filter((x) => x.method === 'action_launch')).toHaveLength(1);
        await expect(sendNewsletter(c, d)).rejects.toThrow('already sent');
  });
});
