import AsyncStorage from '@react-native-async-storage/async-storage';
import { finishBatchChanges } from '../lib/production';
import { OdooClient } from '../lib/odoo';
import { saveOrQueue } from '../lib/queue';
import { loadCarriers } from '../lib/shop';
import { bakery, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: ReturnType<typeof bakery>['odoo']) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('finishing a batch', () => {
  test('a retried batch number step leaves one lot, and the made amount is saved', async () => {
    const { odoo } = bakery();
    const p = odoo.create('product.product', { name: 'Grape jelly' });
    const mo = odoo.create('mrp.production', { name: 'WH/MO/9', state: 'progress', product_id: [p, 'Grape jelly'], product_qty: 12 });
    const c = await client(odoo);
    const batch = { id: mo, name: 'WH/MO/9', productId: p, qty: 12 };
    const changes = finishBatchChanges(batch, 'J-1', '2027-05-01', 10, null);
    // The first step is sent twice, as a retry from the offline queue would.
    await saveOrQueue(c, AsyncStorage, DB, 1, changes[0]!);
    await saveOrQueue(c, AsyncStorage, DB, 1, changes[0]!);
    const row = odoo.tables['mrp.production']![0]!;
    expect((row.lot_producing_ids as number[]).length).toBe(1);
    expect(row.qty_producing).toBe(10);
    // An existing lot replaces the one on the batch rather than joining it.
    const other = odoo.create('stock.lot', { name: 'J-2' });
    await saveOrQueue(c, AsyncStorage, DB, 1, finishBatchChanges(batch, 'J-2', '2027-05-01', 10, other)[0]!);
    expect(row.lot_producing_ids).toEqual([other]);
    for (const ch of changes.slice(1)) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(row.state).toBe('done');
  });
});

describe('delivery methods on Odoo 19', () => {
  test('the list asks only for fields this Odoo has (no zip_from)', async () => {
    const asked: string[][] = [];
    const c = {
      call: async (model: string, method: string, _a: unknown[], kw?: { fields?: string[] }) => {
        if (method === 'fields_get') return { name: {}, delivery_type: {}, fixed_price: {}, is_published: {}, zip_prefix_ids: {} };
        asked.push(kw?.fields ?? []);
        if ((kw?.fields ?? []).some((f) => f === 'zip_from' || f === 'zip_to')) throw new Error("Invalid field 'zip_from' on 'delivery.carrier'");
        return [{ id: 1, name: 'Local delivery', delivery_type: 'fixed', fixed_price: 5 }];
      },
    };
    const list = await loadCarriers(c as never);
    expect(list).toEqual([expect.objectContaining({ name: 'Local delivery', price: 5, zips: '' })]);
    expect(asked[0]).not.toContain('zip_from');
  });
});
