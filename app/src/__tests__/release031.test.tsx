import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings } from '../lib/appSettings';
import { bringKey, loadEvents, loadTests, loadVersions, loadWeek, moveBatchChange, nextVersionCode, saveTestChange, testFromLine, testToLine, versionChanges, weekDays } from '../lib/making';
import { OdooClient } from '../lib/odoo';
import { enqueue, sendQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const run = async (c: OdooClient, ...changes: Parameters<typeof enqueue>[3][]) => {
  for (const ch of changes) await enqueue(AsyncStorage, DB, 1, ch);
  return sendQueue(c, AsyncStorage, DB);
};

describe('week view', () => {
  test('lists planned batches by day and moves one', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const now = new Date(2026, 10, 26);
    const days = weekDays(now);
    expect(days[0]).toBe('2026-11-26');
    expect(days[6]).toBe('2026-12-02');
    const a = odoo.create('mrp.production', { name: 'MO1', product_id: [1, 'Grape jelly'], product_qty: 24, state: 'draft', date_start: '2026-11-27 12:00:00' });
    odoo.create('mrp.production', { name: 'MO2', product_id: [1, 'Grape jelly'], product_qty: 5, state: 'draft', date_start: '2027-02-01 12:00:00' });
    const c = await client(odoo);
    expect((await loadWeek(c, now)).map((b) => b.id)).toEqual([a]);
    await run(c, moveBatchChange({ id: a, product: 'Grape jelly' }, '2026-11-30'));
    expect((await loadWeek(c, now))[0]!.day).toBe('2026-11-30');
  });
});

describe('recipe versions', () => {
  test('codes count up', () => {
    expect(nextVersionCode('', 'Grape jelly')).toBe('Grape jelly v2');
    expect(nextVersionCode('Grape jelly v2', 'x')).toBe('Grape jelly v3');
  });

  test('copies, notes why and archives the old one, once', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const old = odoo.create('mrp.bom', { product_tmpl_id: [1, 'Grape jelly'], code: '', type: 'normal', active: true, bom_line_ids: [], byproduct_ids: [] });
    const c = await client(odoo);
    const changes = versionChanges({ id: old, code: '', name: 'Grape jelly' }, 'Less sugar');
    await run(c, ...changes);
    await run(c, ...changes);
    const boms = odoo.tables['mrp.bom']!.filter((b) => b.code === 'Grape jelly v2');
    expect(boms).toHaveLength(1);
    expect(odoo.tables['mrp.bom']!.find((b) => b.id === old)!.active).toBe(false);
    const notes = odoo.tables['mail.message']!.filter((m) => m.model === 'mrp.bom');
    expect(notes).toHaveLength(1);
    expect(String(notes[0]!.body)).toContain('Less sugar');
    expect((await loadVersions(c, 1)).map((v) => v.code)).toContain('Grape jelly v2');
  });
});

describe('recipe tests', () => {
  test('a test round trips through its line and the settings', async () => {
    await AsyncStorage.clear();
    const t = { key: 'test.abc', recipeId: 3, recipe: 'Grape | jelly', change: 'Less sugar\nmore pectin', qty: 2, taste: 4, texture: 3, set: 5, notes: 'Good', verdict: 'keep' as const };
    expect(testFromLine(t.key, testToLine(t))).toEqual({ ...t, recipe: 'Grape ¦ jelly' });
    const { odoo } = bakery();
    const c = await client(odoo);
    await run(c, saveTestChange({ ...t, recipe: 'Grape jelly' }));
    const found = loadTests(await loadSettings(c));
    expect(found).toHaveLength(1);
    expect(found[0]!.taste).toBe(4);
  });
});

describe('events', () => {
  test('lists events and keeps a bring-list line', async () => {
    const { odoo } = bakery();
    odoo.create('event.event', { name: 'Fall market', date_begin: '2026-10-10 08:00:00', address_id: [1, 'Town square'] });
    const c = await client(odoo);
    expect(await loadEvents(c)).toEqual([{ id: expect.any(Number), name: 'Fall market', start: '2026-10-10', place: 'Town square' }]);
    expect(bringKey(7)).toBe('event.7.bring');
  });
});
