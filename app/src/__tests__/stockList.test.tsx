import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { deviceSecrets } from '../lib/secrets';
import { loadInStock, searchProducts } from '../lib/stock';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
};
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function shelves(odoo: FakeOdoo) {
  odoo.tables['product.category'] = [{ id: 1, name: 'All' }, { id: 2, name: 'Raw Material' }, { id: 3, name: 'Jams' }];
  odoo.tables['uom.uom'] = [{ id: 7, name: 'lb' }];
  const sugar = odoo.create('product.product', { name: 'Sugar', display_name: 'Sugar', categ_id: [2, 'Raw Material'], qty_available: 12.5, free_qty: 10, uom_id: [7, 'lb'], purchase_ok: true });
  const jam = odoo.create('product.product', { name: 'Jam', display_name: 'Jam (8 oz, Ball)', categ_id: [3, 'Jams'], qty_available: 0, free_qty: 0, uom_id: [1, 'Units'], purchase_ok: false });
  return { sugar, jam };
}

describe('ingredient picker and stock list', () => {
  test('ingredients are raw materials only unless everything is asked for; a new untracked ingredient shows', async () => {
    const { odoo } = bakery();
    const k = shelves(odoo);
    const c = await client(odoo);
    expect((await searchProducts(c, '', false, true)).map((r) => r.id)).toEqual([k.sugar]);
    expect((await searchProducts(c, '', false, false)).map((r) => r.id).sort()).toEqual([k.sugar, k.jam].sort());
  });

  test('what is in stock lists products with amounts and units, and can be filtered', async () => {
    const { odoo } = bakery();
    const k = shelves(odoo);
    const c = await client(odoo);
    const all = await loadInStock(c, '', 'all');
    expect(all.find((r) => r.id === k.sugar)).toMatchObject({ name: 'Sugar', onHand: 12.5, free: 10, unit: 'lb' });
    expect((await loadInStock(c, '', 'raw')).map((r) => r.id)).toEqual([k.sugar]);
    expect((await loadInStock(c, '', 'made')).map((r) => r.id)).toEqual([k.jam]);
    expect((await loadInStock(c, 'jam', 'all')).map((r) => r.name)).toEqual(['Jam (8 oz, Ball)']);
  });

  test('the Stock screen opens What’s in stock and shows the list', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const k = shelves(odoo);
    odoo.addEmployee('Ivy', odoo.addUser({ login: 'inv@example.com' }).id, ['Inventory']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'inv@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    await renderRouter('src/app', { initialUrl: '/area/stock' });
    await settle();
    await fireEvent.press(screen.getByTestId('stock-have'));
    await settle();
    expect(await screen.findByTestId(`have-row-${k.sugar}`)).toHaveTextContent(/Sugar.*10 lb free after orders.*12\.5 lb/);
    expect(screen.getByTestId(`have-row-${k.jam}`)).toHaveTextContent(/None on hand/);
  });
});

describe('recipe ingredient picker screen', () => {
  test('shows raw materials only, a switch for everything, and Add a new ingredient', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const k = shelves(odoo);
    odoo.tables['uom.uom']!.push({ id: 1, name: 'Units' });
    const bom = odoo.create('mrp.bom', { product_tmpl_id: [20, 'Jam'], product_id: [k.jam, 'Jam'], product_qty: 8, product_uom_id: [1, 'Units'], code: '', type: 'normal', bom_line_ids: [], byproduct_ids: [] });
    odoo.addEmployee('Pat', odoo.addUser({ login: 'prod@example.com' }).id, ['Production']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'prod@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    await renderRouter('src/app', { initialUrl: '/area/production' });
    await settle();
    await fireEvent.press(screen.getByTestId('open-recipes'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`recipe-edit-${bom}`));
    await settle();
    await fireEvent.press(await screen.findByTestId('pick-ingredient'));
    await settle();
    expect(await screen.findByTestId(`pick-${k.sugar}`)).toBeTruthy();
    expect(screen.queryByTestId(`pick-${k.jam}`)).toBeNull();
    expect(screen.getByTestId('picker-add-new')).toBeTruthy();
    await fireEvent(screen.getByTestId('picker-all'), 'valueChange', true);
    await settle();
    expect(await screen.findByTestId(`pick-${k.jam}`)).toBeTruthy();
  });
});
