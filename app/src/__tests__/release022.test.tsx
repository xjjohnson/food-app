import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAllergenTag, loadAllergens } from '../lib/allergens';
import { OdooClient } from '../lib/odoo';
import { keepPhoto } from '../lib/photoFiles';
import { loadPhotos, photoChange } from '../lib/photos';
import { recallLot, recallText } from '../lib/recall';
import { saveOrQueue, sendQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const files = () => (jest.requireMock('../lib/photoFiles') as { __files: Map<string, string> }).__files;

describe('photos on records', () => {
  test('a photo is kept on the phone, sent once as an attachment, and the file is removed', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const mo = odoo.create('mrp.production', { name: 'MO/1' });
    const c = await client(odoo);
    const kept = await keepPhoto('file:///cache/shot.jpg');
    const change = photoChange('mrp.production', mo, 'Batch photo', kept, 'batch MO/1', 1700000000000);
    expect(JSON.stringify(change)).not.toContain('data-of');
    await saveOrQueue(c, AsyncStorage, DB, 1, change);
    await saveOrQueue(c, AsyncStorage, DB, 1, change);
    await sendQueue(c, AsyncStorage, DB);
    const made = odoo.tables['ir.attachment']!;
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ res_model: 'mrp.production', res_id: mo, mimetype: 'image/jpeg', datas: 'data-of-file:///cache/shot.jpg' });
    expect(files().has(kept)).toBe(false);
    const shown = await loadPhotos(c, 'mrp.production', mo);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ about: 'Batch photo', data: 'data-of-file:///cache/shot.jpg' });
  });

  test('a photo whose file is gone says so in plain words and saves nothing', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const mo = odoo.create('mrp.production', { name: 'MO/2' });
    const c = await client(odoo);
    await expect(saveOrQueue(c, AsyncStorage, DB, 1, photoChange('mrp.production', mo, 'Photo', 'file:///gone.jpg', 'batch MO/2'))).rejects.toThrow('no longer on this phone');
    expect(odoo.tables['ir.attachment'] ?? []).toHaveLength(0);
  });
});

describe('allergens', () => {
  test('only tags starting with Contains count, joined across ingredients', async () => {
    expect(isAllergenTag('Contains milk')).toBe(true);
    expect(isAllergenTag('Organic')).toBe(false);
    const { odoo } = bakery();
    const t1 = odoo.create('product.tag', { name: 'Contains milk' });
    const t2 = odoo.create('product.tag', { name: 'Organic' });
    const t3 = odoo.create('product.tag', { name: 'Contains wheat' });
    const a = odoo.create('product.product', { name: 'Butter', product_tag_ids: [t1, t2] });
    const b = odoo.create('product.product', { name: 'Flour', product_tag_ids: [t3, t1] });
    expect(await loadAllergens(await client(odoo), [a, b])).toEqual(['Contains milk', 'Contains wheat']);
    expect(await loadAllergens(await client(odoo), [])).toEqual([]);
  });
});

describe('recall', () => {
  test('an ingredient batch reaches the customers of the finished batches, and the sheet says so', async () => {
    const calls: Record<string, (args: any[], kw: Record<string, unknown>) => unknown> = {
      'stock.lot.read': ([ids]) => ((ids as number[])[0] === 1 ? [{ id: 1, name: 'SUG-9', product_id: [10, 'Sugar'], expiration_date: false, product_qty: 3 }] : [{ id: 2, name: 'JAM-1', product_id: [20, 'Jam'], expiration_date: '2026-12-30 00:00:00', product_qty: 4 }]),
      'mrp.production.search_read': ([[d]]) => (JSON.stringify(d).includes('[2]') ? [{ id: 5, name: 'MO/5', move_raw_ids: [] }] : []),
      'stock.move.line.search_read': ([[d]]) => (JSON.stringify(d).includes('"lot_id","=",1') ? [{ id: 1, move_id: [7, 'm'], picking_id: false, quantity: 2 }] : [{ id: 2, move_id: [8, 'm'], picking_id: [30, 'WH/OUT/1'], quantity: 2 }]),
      'stock.move.read': ([ids]) => ((ids as number[])[0] === 7 ? [{ id: 7, raw_material_production_id: [5, 'MO/5'] }] : [{ id: 8, raw_material_production_id: false }]),
      'mrp.production.read': (_a, kw) => ((kw.fields as string[]).includes('lot_producing_ids') ? [{ id: 5, lot_producing_ids: [2] }] : [{ id: 5, name: 'MO/5', product_id: [20, 'Jam'] }]),
      'stock.picking.read': () => [{ id: 30, name: 'WH/OUT/1', origin: 'S1', partner_id: [9, 'Anna Cafe'], picking_type_code: 'outgoing', state: 'done' }],
    };
    const c = { call: async (model: string, method: string, args: unknown[], kw: Record<string, unknown> = {}) => (calls[`${model}.${method}`] ? calls[`${model}.${method}`]!(args, kw) : []) };
    const r = await recallLot(c as never, 1);
    expect(r?.customers).toEqual(['Anna Cafe']);
    expect(r?.finished[0]).toMatchObject({ batch: 'MO/5', product: 'Jam', lots: ['JAM-1'] });
    const text = recallText(r!, '2026-11-26');
    expect(text).toContain('Batch SUG-9: Sugar');
    expect(text).toContain('MO/5 Jam (batch JAM-1)');
    expect(text).toContain('Anna Cafe, S1, 2 (in Jam)');
  });
});
