import AsyncStorage from '@react-native-async-storage/async-storage';
import { categoryCostMethod, costingLines, loadCosting } from '../lib/costing';
import { editIngredientChange } from '../lib/ingredientList';
import { checkInChanges, loadReceiptLines, loadReceipts } from '../lib/ingredients';
import { loadMarket, openFor } from '../lib/market';
import { checkOdoo } from '../lib/odooCheck';
import { OdooClient } from '../lib/odoo';
import { finishBatchChanges, loadBatchCost, startBatchChange, loadRecipes, loadBatchDetail } from '../lib/production';
import { saveOrQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo, login = 'baker@example.com') => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login }, 'key');

describe('check-in with the price paid', () => {
  test('the price goes on the order line first, then quantities, then validate', async () => {
    const { odoo } = bakery();
    const flour = odoo.create('product.product', { name: 'Flour', product_tmpl_id: [11, 'Flour'], tracking: 'none' });
    const pol = odoo.create('purchase.order.line', { product_id: [flour, 'Flour'], product_qty: 10, price_unit: 1.5 });
    const pick = odoo.create('stock.picking', { name: 'WH/IN/1', origin: 'P1', picking_type_code: 'incoming', state: 'assigned' });
    odoo.create('stock.move', { picking_id: pick, product_id: [flour, 'Flour'], product_uom_qty: 10, purchase_line_id: [pol, 'x'], location_id: [4, 'V'], location_dest_id: [8, 'S'], move_line_ids: [] });
    const c = await client(odoo);
    const [rec] = await loadReceipts(c);
    const [line] = await loadReceiptLines(c, rec!.id);
    expect(line).toMatchObject({ orderLineId: pol, price: 1.5 });
    const changes = checkInChanges(rec!, [{ line: line!, qty: 10, lot: '', useBy: '', price: 1.8 }]);
    expect(changes.map((x) => x.model)).toEqual(['purchase.order.line', 'stock.move', 'stock.picking']);
    // Same price as the order: nothing to write.
    expect(checkInChanges(rec!, [{ line: line!, qty: 10, lot: '', useBy: '', price: 1.5 }]).map((x) => x.model)).toEqual(['stock.move', 'stock.picking']);
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(odoo.tables['purchase.order.line']![0]!.price_unit).toBe(1.8);
    expect(odoo.tables['stock.picking']![0]!.state).toBe('done');
  });
});

describe('open registers', () => {
  test('lists registers that are open, with how long', async () => {
    const { odoo } = bakery();
    const cfg = odoo.create('pos.config', { name: 'Market' });
    odoo.create('pos.session', { config_id: [cfg, 'Market'], state: 'opened', start_at: '2026-11-25 10:00:00' });
    odoo.create('pos.session', { config_id: [cfg, 'Market'], state: 'closed', start_at: '2026-11-20 10:00:00' });
    const info = await loadMarket(await client(odoo));
    expect(info.open).toEqual([{ configId: cfg, name: 'Market', since: '2026-11-25 10:00:00' }]);
    expect(openFor('2026-11-25 10:00:00', Date.parse('2026-11-25T13:00:00Z'))).toBe('open 3 h');
    expect(openFor('2026-11-20 10:00:00', Date.parse('2026-11-25T13:00:00Z'))).toBe('open 5 days');
  });
});

describe('costing', () => {
  test('the check lists each category and warns when raw materials are not on Average Cost', async () => {
    const { odoo, owner } = bakery();
    const raw = odoo.create('product.category', { name: 'Raw Material', complete_name: 'All / Raw Material', property_cost_method: 'standard', property_valuation: 'real_time' });
    odoo.create('product.category', { name: 'Finished', complete_name: 'All / Finished', property_cost_method: 'average', property_valuation: 'real_time' });
    const c = await client(odoo, owner.login);
    expect(await categoryCostMethod(c, raw)).toBe('standard');
    const rows = await loadCosting(c);
    const lines = costingLines(rows);
    expect(lines.find((l) => l.label.includes('Raw'))).toMatchObject({ ok: false, note: expect.stringContaining('Average Cost') });
    expect(lines.find((l) => l.label.includes('Finished'))!.ok).toBe(true);
    const report = await checkOdoo(c);
    expect(report.lines.some((l) => l.label === 'Costing: All / Raw Material' && !l.ok)).toBe(true);
    expect(odoo.calls.filter((x) => !['search_read', 'read', 'search_count', 'has_group', 'fields_get'].includes(x.method))).toEqual([]);
  });

  test('Cost is left out of the save when Odoo sets it', () => {
    const v = { name: 'Flour', categoryId: 3, cost: 2, taxIds: [], reference: '', barcode: '' };
    expect((editIngredientChange(5, { ...v, costLocked: true }).args[1] as Record<string, unknown>)).not.toHaveProperty('standard_price');
    expect((editIngredientChange(5, v).args[1] as Record<string, unknown>).standard_price).toBe(2);
  });
});

describe('finishing a batch with real amounts', () => {
  test('only changed amounts are written, and the cost Odoo worked out is read back', async () => {
    const { odoo } = bakery();
    const flour = odoo.create('product.product', { name: 'Flour', free_qty: 50 });
    const cookie = odoo.create('product.product', { name: 'Cookies', free_qty: 0 });
    const bom = odoo.create('mrp.bom', { product_tmpl_id: [1, 'Cookies'], product_id: [cookie, 'Cookies'], product_qty: 10, product_uom_id: [1, 'Units'], type: 'normal', bom_line_ids: [] });
    const l1 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [flour, 'Flour'], product_qty: 3 });
    odoo.tables['mrp.bom']![0]!.bom_line_ids = [l1];
    const c = await client(odoo);
    const [r] = await loadRecipes(c);
    await saveOrQueue(c, AsyncStorage, DB, 1, startBatchChange(r!, 10));
    const mo = odoo.tables['mrp.production']![0]!;
    const d = (await loadBatchDetail(c, mo.id))!;
    const move = d.ingredients[0]!;
    const same = finishBatchChanges({ id: mo.id, name: String(mo.name), productId: cookie, qty: 10 }, 'B', '2026-12-09', 10, null, [{ moveId: move.id, name: 'Flour', planned: 3, actual: 3 }]);
    expect(same.map((x) => x.model)).toEqual(['mrp.production', 'mrp.production']);
    const changes = finishBatchChanges({ id: mo.id, name: String(mo.name), productId: cookie, qty: 10 }, 'B', '2026-12-09', 10, null, [{ moveId: move.id, name: 'Flour', planned: 3, actual: 3.5 }]);
    expect(changes.map((x) => x.model)).toEqual(['stock.move', 'mrp.production', 'mrp.production']);
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(odoo.tables['stock.move']!.find((m) => m.id === move.id)).toMatchObject({ quantity: 3.5, picked: true });
    // Nothing to read until something was made.
    expect(await loadBatchCost(c, mo.id)).toBeNull();
    const fin = odoo.create('stock.move', { product_id: [cookie, 'Cookies'], state: 'done', quantity: 10, value: 25 });
    mo.move_finished_ids = [fin];
    odoo.declared['stock.move'] = ['value'];
    expect(await loadBatchCost(c, mo.id)).toEqual({ total: 25, perUnit: 2.5, made: 10 });
    // No cost figure: still say how many were made.
    odoo.tables['stock.move']!.find((m) => m.id === fin)!.value = 0;
    expect(await loadBatchCost(c, mo.id)).toEqual({ total: 0, perUnit: 0, made: 10 });
  });
});
