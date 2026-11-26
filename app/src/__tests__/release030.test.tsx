import AsyncStorage from '@react-native-async-storage/async-storage';
import { countMyTasks, countSpecialSoon, doneChange, findLink, loadHistory, loadTasks, nextOccurrence, specialDateChange, taskChange, taskProblems, thankYouChange } from '../lib/activities';
import { OdooClient } from '../lib/odoo';
import { dbName, plainReason, stepsOf } from '../lib/queueCenter';
import { enqueue, sendQueue, loadQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('tasks', () => {
  test('a task is made once, listed, and ticked done', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const home = odoo.create('res.partner', { name: 'Food app settings' });
    const c = await client(odoo);
    const change = taskChange({ title: 'Wash the jars', due: '2026-12-01', userId: 0, fallbackId: home }, c.session.uid);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    await enqueue(AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    const list = await loadTasks(c, true);
    expect(list.map((t) => t.title)).toEqual(['Wash the jars']);
    expect(list[0]!.resId).toBe(home);
    await enqueue(AsyncStorage, DB, 1, doneChange(list[0]!));
    await sendQueue(c, AsyncStorage, DB);
    expect(await loadTasks(c, true)).toEqual([]);
  });

  test('a person only sees their own tasks', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    odoo.create('mail.activity', { res_model: 'res.partner', res_id: 1, summary: 'Mine', date_deadline: '2026-01-01', user_id: c.session.uid });
    odoo.create('mail.activity', { res_model: 'res.partner', res_id: 1, summary: 'Theirs', date_deadline: '2026-01-02', user_id: 999 });
    expect((await loadTasks(c, false)).map((t) => t.title)).toEqual(['Mine']);
    expect((await loadTasks(c, true)).map((t) => t.title)).toEqual(['Mine', 'Theirs']);
    expect(await countMyTasks(c)).toBe(1);
  });

  test('checks the form and finds a batch or order by name', async () => {
    expect(taskProblems({ title: '', due: 'soon' })).toHaveLength(2);
    expect(taskProblems({ title: 'x', due: '2026-12-05' })).toEqual([]);
    const { odoo } = bakery();
    odoo.create('sale.order', { name: 'S00042' });
    const c = await client(odoo);
    expect(await findLink(c, 'S00042')).toMatchObject({ model: 'sale.order', name: 'S00042' });
    expect(await findLink(c, 'nope')).toBeNull();
  });
});

describe('thank-you and special dates', () => {
  test('thank-you reminder is made once per order', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    const ch = thankYouChange({ partnerId: 7, customer: 'Ann', saleName: 'S1' }, c.session.uid, '2026-12-01');
    await enqueue(AsyncStorage, DB, 1, ch);
    await sendQueue(c, AsyncStorage, DB);
    await enqueue(AsyncStorage, DB, 1, ch);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['mail.activity']!.filter((r) => String(r.summary).startsWith('Write a thank-you'))).toHaveLength(1);
  });

  test('next occurrence rolls to next year, and Today counts this week', async () => {
    expect(nextOccurrence('09-15', new Date(2026, 9, 1))).toBe('2027-09-15');
    expect(nextOccurrence('12-01', new Date(2026, 10, 26))).toBe('2026-12-01');
    const { odoo } = bakery();
    const c = await client(odoo);
    const now = new Date(2026, 10, 26);
    const ch = specialDateChange({ partnerId: 3, name: 'Ann', kind: 'Birthday', md: '11-28' }, c.session.uid, now);
    expect(ch.args[0]).toMatchObject({ summary: 'Birthday: Ann', date_deadline: '2026-11-28' });
    await enqueue(AsyncStorage, DB, 1, ch);
    await sendQueue(c, AsyncStorage, DB);
    expect(await countSpecialSoon(c, 7, now)).toBe(1);
  });
});

describe('history and queue words', () => {
  test('history lists messages newest first', async () => {
    const { odoo } = bakery();
    odoo.create('mail.message', { model: 'res.partner', res_id: 5, body: '<p>Changed phone</p>', date: '2026-11-01 10:00:00', author_id: [1, 'Justin'] });
    odoo.create('mail.message', { model: 'res.partner', res_id: 5, body: '<p>Newer</p>', date: '2026-11-02 10:00:00' });
    const c = await client(odoo);
    const h = await loadHistory(c, 'res.partner', 5);
    expect(h.map((x) => x.text)).toEqual(['Newer', 'Changed phone']);
    expect(h[1]!.who).toBe('Justin');
  });

  test('queue words', async () => {
    expect(dbName(DB)).toBe('food-test');
    expect(plainReason('You are not allowed to modify this')).toMatch(/permission/);
    expect(plainReason(undefined)).toMatch(/no reason/);
    await AsyncStorage.clear();
    const x = await enqueue(AsyncStorage, DB, 1, { label: 'Bought', model: 'purchase.order', method: 'create', args: [{}], step: { kind: 'bill', token: 't', date: '2026-01-01', journalId: null } });
    expect(stepsOf(x)).toEqual(['Make the bill']);
    expect((await loadQueue(AsyncStorage)).length).toBe(1);
  });
});
