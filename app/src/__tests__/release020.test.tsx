import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_STEPS, loadSteps, loadTicks, tickChange } from '../lib/checklist';
import { OdooClient } from '../lib/odoo';
import { loadNeedRows, loadPlanned, loadPriceCost, loadShoppingList, planBatchChange, planNeeds } from '../lib/plan';
import { loadRecipes } from '../lib/production';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function larder(odoo: FakeOdoo) {
  const pack = odoo.create('product.category', { name: 'Packaging' });
  const raw = odoo.create('product.category', { name: 'Raw Material' });
  const flour = odoo.create('product.product', { name: 'Flour', free_qty: 5, incoming_qty: 2, categ_id: [raw, 'Raw Material'], product_tmpl_id: 11 });
  const jar = odoo.create('product.product', { name: 'Jar', free_qty: 10, incoming_qty: 0, categ_id: [pack, 'Packaging'], product_tmpl_id: 12, list_price: 0, standard_price: 0.4 });
  const jam = odoo.create('product.product', { name: 'Jam', free_qty: 0, list_price: 8, standard_price: 3.1 });
  const bom = odoo.create('mrp.bom', { product_tmpl_id: [1, 'Jam'], product_id: [jam, 'Jam'], product_qty: 12, product_uom_id: [1, 'Units'], type: 'normal', bom_line_ids: [] });
  const l1 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [flour, 'Flour'], product_qty: 3, product_uom_id: [1, 'kg'] });
  const l2 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [jar, 'Jar'], product_qty: 12, product_uom_id: [1, 'Units'] });
  odoo.tables['mrp.bom']![0]!.bom_line_ids = [l1, l2];
  return { flour, jar, jam, bom };
}

describe('plan batches and shopping list', () => {
  test('adds up the recipe amounts, then shows on hand, on order and what is short, packaging apart', async () => {
    const { odoo } = bakery();
    const l = larder(odoo);
    const c = await client(odoo);
    const [recipe] = await loadRecipes(c);
    const needs = planNeeds([{ recipe: recipe!, qty: 24 }, { recipe: recipe!, qty: 12 }]);
    expect(needs.map((n) => [n.name, n.needed])).toEqual([['Flour', 9], ['Jar', 36]]);
    const rows = await loadNeedRows(c, needs);
    expect(rows.find((r) => r.name === 'Flour')).toMatchObject({ have: 5, onOrder: 2, short: 2, packaging: false });
    expect(rows.find((r) => r.name === 'Jar')).toMatchObject({ have: 10, short: 26, packaging: true });
    expect(l.flour).toBeGreaterThan(0);
  });

  test('a plan is saved as draft batches in Odoo, once, even through the offline queue, and the shopping list is built from them', async () => {
    const { odoo } = bakery();
    larder(odoo);
    const c = await client(odoo);
    const [recipe] = await loadRecipes(c);
    const ch = planBatchChange(recipe!, 24);
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, ch)).status).toBe('queued');
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(1);
    expect(odoo.tables['mrp.production']).toHaveLength(1);
    expect(odoo.tables['mrp.production']![0]).toMatchObject({ state: 'draft', product_qty: 24 });
    const planned = await loadPlanned(c, [recipe!]);
    expect(planned.map((p) => p.qty)).toEqual([24]);
    const shop = await loadShoppingList(c, await loadNeedRows(c, planNeeds(planned)));
    expect(shop.map((s) => [s.name, s.buy])).toEqual([['Jar', 14]]);
  });

  test('a supplier groups the list and running-low items are added', async () => {
    const { odoo } = bakery();
    const l = larder(odoo);
    const sugar = odoo.create('product.product', { name: 'Sugar', product_tmpl_id: 13 });
    const heb = odoo.create('res.partner', { name: 'HEB' });
    odoo.create('product.supplierinfo', { product_tmpl_id: 13, partner_id: [heb, 'HEB'] });
    odoo.create('stock.warehouse.orderpoint', { product_id: [sugar, 'Sugar'], product_min_qty: 5, product_max_qty: 20, qty_on_hand: 1, qty_forecast: 1, qty_to_order: 19 });
    const c = await client(odoo);
    const shop = await loadShoppingList(c, []);
    expect(shop).toEqual([expect.objectContaining({ name: 'Sugar', supplier: 'HEB', why: 'Running low', buy: 19 })]);
    expect(l.jar).toBeGreaterThan(0);
  });

  test('price and cost come from Odoo, side by side', async () => {
    const { odoo } = bakery();
    const l = larder(odoo);
    expect(await loadPriceCost(await client(odoo), l.jam)).toEqual({ price: 8, cost: 3.1 });
  });
});

describe('batch checklist', () => {
  test('uses the default steps with no survey, and the survey questions when there is one', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    expect(await loadSteps(c)).toEqual(DEFAULT_STEPS);
    const s = odoo.create('survey.survey', { title: 'Batch checklist: jam' });
    odoo.create('survey.question', { survey_id: s, title: 'Jars washed', sequence: 1, is_page: false });
    odoo.create('survey.question', { survey_id: s, title: 'Lids on', sequence: 2, is_page: false });
    expect(await loadSteps(c)).toEqual(['Jars washed', 'Lids on']);
  });

  test('a tick is saved once on the batch, works offline, and shows as done', async () => {
    const { odoo } = bakery();
    larder(odoo);
    const c = await client(odoo);
    const mo = odoo.create('mrp.production', { name: 'WH/MO/00001', state: 'confirmed' });
    const steps = ['Cook', 'Fill'];
    const t = tickChange(mo, 'WH/MO/00001', 0, 'Cook');
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, t)).status).toBe('queued');
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    await saveOrQueue(c, AsyncStorage, DB, 1, t);
    expect(odoo.tables['mail.message']!.filter((m) => m.model === 'mrp.production')).toHaveLength(1);
    expect((await loadTicks(c, mo, steps)).map((r) => [r.name, r.done])).toEqual([['Cook', true], ['Fill', false]]);
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
  });
});
