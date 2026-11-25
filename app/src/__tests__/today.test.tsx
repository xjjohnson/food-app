import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { currencySymbol, lookupProducts, stockByBatch } from '../lib/lookup';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { NO_ROLES } from '../lib/roles';
import { deviceSecrets } from '../lib/secrets';
import { loadToday } from '../lib/today';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

function bakeryDay(odoo: FakeOdoo) {
  const cookie = odoo.create('product.product', { name: 'Chocolate chip cookies', list_price: 12.5, qty_available: 24, image_128: 'iVBORw0KGgo=' });
  const l1 = odoo.create('stock.lot', { name: 'CC-2', product_id: [cookie, 'cookies'], expiration_date: '2027-02-01 12:00:00' });
  const l2 = odoo.create('stock.lot', { name: 'CC-1', product_id: [cookie, 'cookies'], expiration_date: '2026-12-01 12:00:00' });
  odoo.create('stock.quant', { product_id: [cookie, 'cookies'], lot_id: [l1, 'CC-2'], quantity: 10, 'location_id.usage': 'internal' });
  odoo.create('stock.quant', { product_id: [cookie, 'cookies'], lot_id: [l2, 'CC-1'], quantity: 14, 'location_id.usage': 'internal' });
  odoo.create('mrp.production', { name: 'WH/MO/00001', state: 'confirmed' });
  odoo.create('mrp.production', { name: 'WH/MO/00002', state: 'done' });
  odoo.create('stock.picking', { name: 'WH/OUT/1', picking_type_code: 'outgoing', state: 'assigned' });
  return { cookie };
}

describe('today and product lookup', () => {
  test('Today counts only what the person’s roles use', async () => {
    const { odoo } = bakery();
    bakeryDay(odoo);
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    const baker = await loadToday(c, { ...NO_ROLES, production: true });
    expect(baker.map((t) => [t.id, t.count])).toEqual([['batches', 1]]);
    const owner = await loadToday(c, { ...NO_ROLES, owner: true });
    expect(owner.map((t) => t.id)).toEqual(['batches', 'orders', 'expiring', 'low', 'deliveries']);
    expect(owner.find((t) => t.id === 'orders')!.count).toBe(1);
  });

  test('lookup gives the price as Odoo has it, the photo, and stock by batch, soonest use-by first', async () => {
    const { odoo } = bakery();
    const s = bakeryDay(odoo);
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    const [p] = await lookupProducts(c, 'cookie');
    expect(p).toMatchObject({ name: 'Chocolate chip cookies', price: 12.5, onHand: 24, photo: 'iVBORw0KGgo=' });
    expect((await stockByBatch(c, s.cookie)).map((b) => [b.lot, b.qty])).toEqual([['CC-1', 14], ['CC-2', 10]]);
    expect(await currencySymbol(c, 1)).toBe('$');
    expect(odoo.calls.every((x) => ['search_read', 'read', 'search_count', 'has_group', 'fields_get', 'search'].includes(x.method))).toBe(true);
  });

  test('the home screen shows Today for a baker, and Find a product opens the lookup', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const s = bakeryDay(odoo);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'baker@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    expect(screen.getByTestId('today-batches')).toHaveTextContent(/1/);
    await fireEvent.press(screen.getByTestId('open-lookup'));
    await settle();
    await fireEvent.press(await screen.findByLabelText('Chocolate chip cookies'));
    await settle();
    expect(screen.getByTestId('product-' + s.cookie)).toHaveTextContent(/\$12\.50/);
    expect(await screen.findByTestId(`batch-line-${odoo.tables['stock.lot']![1]!.id}`)).toHaveTextContent(/CC-1/);
  });
});
