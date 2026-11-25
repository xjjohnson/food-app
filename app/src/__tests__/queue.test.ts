import AsyncStorage from '@react-native-async-storage/async-storage';
import { OdooClient } from '../lib/odoo';
import { enqueue, loadQueue, QUEUE_KEY, removeChange, retryChange, saveOrQueue, sendQueue } from '../lib/queue';
import { testNoteChange } from '../lib/testNote';
import { setPretendOffline } from '../lib/devFlags';
import { bakery, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const OTHER = 'https://food.example.com|food';
const note = (name: string) => ({ label: name, model: 'res.partner', method: 'create', args: [{ name }] });

async function setup() {
  const f = bakery();
  const c = await OdooClient.signIn(f.odoo.fetch, { url: URL, db: 'food-test', login: f.owner.login }, 'key');
  return { ...f, c };
}
const created = (odoo: ReturnType<typeof bakery>['odoo']) => odoo.calls.filter((x) => x.method === 'create').map((x) => (x.args[0] as { name: string }).name);

describe('the offline queue', () => {
  test('with signal a change goes straight to Odoo', async () => {
    const { odoo, c } = await setup();
    const r = await saveOrQueue(c, AsyncStorage, DB, 1, note('A'));
    expect(r.status).toBe('saved');
    expect(created(odoo)).toEqual(['A']);
    expect(await loadQueue(AsyncStorage)).toEqual([]);
  });

  test('without signal it waits, then goes in the order it was made', async () => {
    const { odoo, c } = await setup();
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, note('A'))).status).toBe('queued');
    odoo.offline = false;
    // A later change waits behind the earlier one, even with signal.
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, note('B'))).status).toBe('queued');
    const r = await sendQueue(c, AsyncStorage, DB);
    expect(r).toMatchObject({ sent: 2, left: 0, offline: false });
    expect(created(odoo)).toEqual(['A', 'B']);
  });

  test('a send that loses signal stops and keeps everything', async () => {
    const { odoo, c } = await setup();
    await enqueue(AsyncStorage, DB, 1, note('A'));
    await enqueue(AsyncStorage, DB, 1, note('B'));
    setPretendOffline(true);
    const r = await sendQueue(c, AsyncStorage, DB);
    expect(r).toMatchObject({ sent: 0, offline: true, left: 2 });
    const q = await loadQueue(AsyncStorage);
    expect(q.map((x) => [x.label, x.state, x.tries])).toEqual([['A', 'waiting', 1], ['B', 'waiting', 0]]);
    expect(odoo.calls.filter((x) => x.method === 'create')).toEqual([]);
  });

  test('a change Odoo refuses needs a look, and nothing after it is sent until it is sorted', async () => {
    const { odoo, c } = await setup();
    await enqueue(AsyncStorage, DB, 1, { label: 'Bad', model: 'res.partner', method: 'write', args: [[1], { name: 'x' }] });
    await enqueue(AsyncStorage, DB, 1, note('After'));
    odoo.refuse['res.partner.write'] = 'That contact is archived.';
    const r = await sendQueue(c, AsyncStorage, DB);
    expect(r.stuck).toMatchObject({ label: 'Bad', state: 'stuck', error: 'That contact is archived.' });
    expect(created(odoo)).toEqual([]);
    // Fixed in Odoo, tried again: both go, in order.
    delete odoo.refuse['res.partner.write'];
    await retryChange(AsyncStorage, r.stuck!.id);
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(2);
    expect(created(odoo)).toEqual(['After']);
  });

  test('a removed change is never sent', async () => {
    const { odoo, c } = await setup();
    const a = await enqueue(AsyncStorage, DB, 1, note('A'));
    await removeChange(AsyncStorage, a.id);
    await sendQueue(c, AsyncStorage, DB);
    expect(created(odoo)).toEqual([]);
  });

  test('changes made for another database are never sent here', async () => {
    const { odoo, c } = await setup();
    await enqueue(AsyncStorage, OTHER, 1, note('Live one'));
    await enqueue(AsyncStorage, DB, 1, note('Test one'));
    const r = await sendQueue(c, AsyncStorage, DB);
    expect(r.sent).toBe(1);
    expect(created(odoo)).toEqual(['Test one']);
    expect((await loadQueue(AsyncStorage)).map((x) => x.label)).toEqual(['Live one']);
  });

  test('a change that already reached Odoo (answer lost) is not made twice', async () => {
    const { odoo, c, owner } = await setup();
    const change = testNoteChange(owner.partner, 1_700_000_000_000);
    await enqueue(AsyncStorage, DB, 1, change);
    // It got there, but the phone never heard back.
    await c.call(change.model, change.method, change.args, change.kwargs);
    expect(odoo.tables['mail.message']!.length).toBe(1);
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(1);
    expect(odoo.tables['mail.message']!.length).toBe(1);
  });

  test('an entry this version of the app does not understand is held, not sent', async () => {
    const { odoo, c } = await setup();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([{ v: 99, id: 'x', db: DB, label: 'From the future', model: 'res.partner', method: 'create', args: [{ name: 'F' }], state: 'waiting', tries: 0 }]));
    const r = await sendQueue(c, AsyncStorage, DB);
    expect(r.stuck?.label).toBe('From the future');
    expect(created(odoo)).toEqual([]);
  });
});
