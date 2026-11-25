import AsyncStorage from '@react-native-async-storage/async-storage';
import { OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { blankRecipe, loadRecipe, moveLine, newRecipeChange, recipeChanges, recipeProblems, type Recipe } from '../lib/recipe';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function kitchen(odoo: FakeOdoo) {
  odoo.tables['uom.uom'] = [{ id: 1, name: 'Units' }, { id: 2, name: 'g' }];
  const flour = odoo.create('product.product', { name: 'Flour' });
  const sugar = odoo.create('product.product', { name: 'Sugar' });
  const jam = odoo.create('product.product', { name: 'Jam' });
  const bom = odoo.create('mrp.bom', { product_tmpl_id: [20, 'Cookies'], product_id: false, product_qty: 48, product_uom_id: [1, 'Units'], code: '', type: 'normal', bom_line_ids: [], byproduct_ids: [] });
  const make = async (p: number, q: number, seq: number) => (await client(odoo)).call('mrp.bom.line', 'create', [{ bom_id: bom, product_id: p, product_qty: q, product_uom_id: 2, sequence: seq }]);
  return { flour, sugar, jam, bom, make };
}

async function load(odoo: FakeOdoo, bom: number) {
  return (await loadRecipe(await client(odoo), bom))!;
}
const copy = (r: Recipe): Recipe => ({ ...r, lines: r.lines.map((l) => ({ ...l })), byproducts: r.byproducts.map((l) => ({ ...l })) });

describe('recipe form', () => {
  test('nothing changed means nothing to send', async () => {
    const { odoo } = bakery();
    const k = kitchen(odoo);
    await k.make(k.flour, 3, 10);
    const r = await load(odoo, k.bom);
    expect(recipeChanges(r, copy(r))).toEqual([]);
  });

  test('header, units, order, removal and additions are saved together', async () => {
    const { odoo } = bakery();
    const k = kitchen(odoo);
    const c = await client(odoo);
    await k.make(k.flour, 3, 10);
    await k.make(k.sugar, 1, 20);
    const before = await load(odoo, k.bom);
    const d = copy(before);
    d.makes = '96';
    d.code = 'COOK';
    d.type = 'phantom';
    d.lines = moveLine(d.lines, 1, -1); // sugar first
    d.lines[1]!.qty = '5';
    d.lines.push({ key: 'x', id: null, productId: k.jam, name: 'Jam', qty: '2', unitId: 2, unit: 'g' });
    d.byproducts.push({ key: 'y', id: null, productId: k.jam, name: 'Jam', qty: '1', unitId: 1, unit: 'Units', costShare: '10' });
    for (const ch of recipeChanges(before, d)) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    const after = await load(odoo, k.bom);
    expect(after).toMatchObject({ makes: '96', code: 'COOK', type: 'phantom' });
    expect(after.lines.map((l) => [l.name, l.qty])).toEqual([['Sugar', '1'], ['Flour', '5'], ['Jam', '2']]);
    expect(after.byproducts.map((l) => [l.name, l.costShare])).toEqual([['Jam', '10']]);
    // removing a line and a by-product
    const d2 = copy(after);
    d2.lines = d2.lines.filter((l) => l.name !== 'Sugar');
    d2.byproducts = [];
    for (const ch of recipeChanges(after, d2)) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    const last = await load(odoo, k.bom);
    expect(last.lines.map((l) => l.name)).toEqual(['Flour', 'Jam']);
    expect(last.byproducts).toEqual([]);
  });

  test('a new recipe is one create, and sent once after offline', async () => {
    const { odoo } = bakery();
    const k = kitchen(odoo);
    const c = await client(odoo);
    const r = blankRecipe();
    Object.assign(r, { templateId: 21, templateName: 'Bread', makes: '2', unitId: 1, unit: 'Units' });
    r.lines.push({ key: 'a', id: null, productId: k.flour, name: 'Flour', qty: '500', unitId: 2, unit: 'g' });
    expect(recipeProblems(r)).toEqual([]);
    const ch = newRecipeChange(r);
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, ch)).status).toBe('queued');
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['mrp.bom']).toHaveLength(2);
    expect(odoo.tables['mrp.bom.line']).toHaveLength(1);
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
  });

  test('problems are named', () => {
    const r = blankRecipe();
    expect(recipeProblems(r).length).toBeGreaterThanOrEqual(3);
  });

  test('moveLine stays inside the list', () => {
    const l = [{ key: 'a' }, { key: 'b' }] as never[];
    expect(moveLine(l, 0, -1)).toBe(l);
    expect(moveLine(l, 0, 1).map((x: { key: string }) => x.key)).toEqual(['b', 'a']);
  });
});
