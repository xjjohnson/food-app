import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, parseSettings, settingChange, useByDays, writeSettings } from '../lib/appSettings';
import { OdooClient } from '../lib/odoo';
import { moveChange, placesOn, runMove } from '../lib/places';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { countChange, loadCountLines, loadExpiring, loadWasteReasons, wasteChange } from '../lib/stock';
import { loadToday } from '../lib/today';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function shelf(odoo: FakeOdoo) {
  const jelly = odoo.create('product.product', { name: 'Grape jelly', display_name: 'Grape jelly' });
  const lot = odoo.create('stock.lot', { name: 'J-1', product_id: [jelly, 'Grape jelly'], product_qty: 6, expiration_date: '2026-12-01 00:00:00' });
  const q = odoo.create('stock.quant', { product_id: [jelly, 'Grape jelly'], lot_id: [lot, 'J-1'], location_id: [8, 'WH/Stock'], quantity: 6 });
  return { jelly, lot, q };
}

describe('settings kept in Odoo', () => {
  test('lines parse and write back, and the window falls back to 14 days', () => {
    expect(parseSettings('<p>useByDays=10</p><p>unit.5=cup|120|g</p>')).toEqual({ useByDays: '10', 'unit.5': 'cup|120|g' });
    expect(writeSettings({ a: '1' })).toBe('<p>a=1</p>');
    expect(useByDays({})).toBe(14);
    expect(useByDays({ useByDays: '9' })).toBe(9);
    expect(useByDays({ useByDays: 'x' })).toBe(14);
  });

  test('saving makes the contact once, then changes it, offline or not; Today uses the number', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, settingChange('useByDays', '30'))).status).toBe('queued');
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    await saveOrQueue(c, AsyncStorage, DB, 1, settingChange('unit.5', 'cup|120|g'));
    await saveOrQueue(c, AsyncStorage, DB, 1, settingChange('useByDays', '21'));
    expect(odoo.tables['res.partner']!.filter((p) => p.name === 'Food app settings')).toHaveLength(1);
    expect(await loadSettings(c)).toEqual({ useByDays: '21', 'unit.5': 'cup|120|g' });
    // A batch 25 days out is seen with a 30-day window but not a 21-day one.
    const s = shelf(odoo);
    odoo.tables['stock.lot']!.find((l) => l.id === s.lot)!.expiration_date = `${new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10)} 00:00:00`;
    expect((await loadExpiring(c, 21)).length).toBe(0);
    await saveOrQueue(c, AsyncStorage, DB, 1, settingChange('useByDays', '30'));
    const owner = { owner: true, production: false, inventory: false, sales: false, shipping: false };
    expect((await loadToday(c, owner)).find((t) => t.id === 'expiring')!.count).toBe(1);
  });
});

describe('stock count with a safety check', () => {
  test('applies when stock is as seen, and stops with a plain reason when it moved meanwhile', async () => {
    const { odoo } = bakery();
    const s = shelf(odoo);
    const c = await client(odoo);
    const line = (await loadCountLines(c, s.jelly))[0]!;
    // Someone sold 2 while this phone had no signal.
    odoo.tables['stock.quant']!.find((q) => q.id === s.q)!.quantity = 4;
    odoo.offline = true;
    await saveOrQueue(c, AsyncStorage, DB, 1, countChange('Grape jelly', line, 5));
    odoo.offline = false;
    const r = await sendQueue(c, AsyncStorage, DB);
    expect(r.sent).toBe(0);
    expect(r.stuck?.error).toMatch(/Stock changed since you counted: you saw 6, Odoo now has 4/);
    expect(odoo.tables['stock.quant']!.find((q) => q.id === s.q)!.quantity).toBe(4);
    expect(await loadQueue(AsyncStorage)).toHaveLength(1);
  });
});

describe('waste and spoilage', () => {
  test('takes the batch quantity off the stock with a reason, once', async () => {
    const { odoo } = bakery();
    const s = shelf(odoo);
    odoo.create('stock.scrap.reason.tag', { name: 'Dropped', sequence: 1 });
    const c = await client(odoo);
    const reasons = await loadWasteReasons(c);
    expect(reasons.map((r) => r.name)).toEqual(['Dropped']);
    await saveOrQueue(c, AsyncStorage, DB, 1, wasteChange('Grape jelly', s.jelly, s.lot, 2, [reasons[0]!.id]));
    expect(odoo.tables['stock.scrap']![0]).toMatchObject({ product_id: s.jelly, lot_id: s.lot, scrap_qty: 2, state: 'done', scrap_reason_tag_ids: [[6, 0, [reasons[0]!.id]]] });
  });
});

describe('places', () => {
  test('knows whether Storage Locations is on, and a move makes, reserves and validates one transfer', async () => {
    const { odoo } = bakery();
    odoo.users.find((u) => u.login === 'baker@example.com')!.groups.push('stock.group_stock_multi_locations');
    expect(await placesOn(await client(odoo))).toBe(true);
    const calls: string[] = [];
    const picking = { id: 9, state: 'draft' as string, found: false };
    const stub = {
      call: async (model: string, method: string, args: unknown[]) => {
        calls.push(`${model}.${method}`);
        if (model === 'stock.picking' && method === 'search_read') return picking.found ? [{ id: 9, state: picking.state }] : [];
        if (model === 'stock.picking.type') return [{ id: 3 }];
        if (model === 'stock.picking' && method === 'create') {
          picking.found = true;
          return 9;
        }
        if (model === 'stock.move') return [{ move_line_ids: [77] }];
        if (model === 'stock.picking' && method === 'button_validate') picking.state = 'done';
        void args;
        return true;
      },
    };
    const ch = moveChange({ placeId: 1, place: 'Pantry', productId: 5, product: 'Flour', lotId: 4, lot: 'F1', qty: 10 }, { id: 2, name: 'Freezer' }, 3);
    const step = ch.step as Extract<NonNullable<typeof ch.step>, { kind: 'move' }>;
    await runMove(stub, step);
    expect(calls).toEqual(['stock.picking.search_read', 'stock.picking.type.search_read', 'stock.picking.create', 'stock.picking.action_confirm', 'stock.picking.action_assign', 'stock.move.search_read', 'stock.move.line.write', 'stock.picking.button_validate']);
    calls.length = 0;
    await runMove(stub, step);
    expect(calls).toEqual(['stock.picking.search_read']);
  });
});
