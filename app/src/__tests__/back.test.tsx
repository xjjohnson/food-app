import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { innerBackDepth, runInnerBack } from '../lib/innerBack';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { deviceSecrets } from '../lib/secrets';
import { searchProducts } from '../lib/stock';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
};

async function open(odoo: FakeOdoo, url: string, role: string) {
  await AsyncStorage.clear();
  odoo.addEmployee('Tester', odoo.addUser({ login: 'role@example.com' }).id, [role]);
  globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
  const login = { url: URL, db: 'food-test', login: 'role@example.com' };
  await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
  await deviceSecrets().set('odoo.secret', 'key');
  await setDbKind(AsyncStorage, login, 'test');
  await renderRouter('src/app', { initialUrl: url });
  await settle();
}

describe('Back goes one screen back', () => {
  test('inside Stock, Back leaves Find a batch for the Stock menu, then leaves Stock', async () => {
    const { odoo } = bakery();
    await open(odoo, '/area/stock', 'Inventory');
    await fireEvent.press(screen.getByTestId('stock-find'));
    await settle();
    expect(screen.getByTestId('find-screen')).toBeTruthy();
    expect(innerBackDepth()).toBe(1);
    await fireEvent.press(screen.getByTestId('back'));
    await settle();
    expect(screen.getByTestId('stock-screen')).toBeTruthy();
    expect(innerBackDepth()).toBe(0);
    expect(runInnerBack()).toBe(false);
  });

  test('the phone’s back gesture closes the inner page first', async () => {
    const { odoo } = bakery();
    await open(odoo, '/area/stock', 'Inventory');
    await fireEvent.press(screen.getByTestId('stock-expiring'));
    await settle();
    await act(async () => {
      expect(runInnerBack()).toBe(true);
    });
    await settle();
    expect(screen.getByTestId('stock-screen')).toBeTruthy();
  });

  test('the form opened from a list goes back to the list, one step at a time', async () => {
    const { odoo } = bakery();
    odoo.declared['res.partner'] = ['name', 'phone', 'email'];
    await open(odoo, '/', 'Sales');
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    await fireEvent.press(screen.getByTestId('open-contacts'));
    await settle();
    await fireEvent.press(screen.getByTestId('new-contact'));
    await settle();
    expect(screen.getByTestId('contact-form')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back'));
    await settle();
    expect(screen.getByTestId('contacts-screen')).toBeTruthy();
  });
});

describe('product picker', () => {
  test('variants show their full names and products with a recipe come first', async () => {
    const { odoo } = bakery();
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    const a = odoo.create('product.product', { name: 'Apricot Freezer Jam', display_name: 'Apricot Freezer Jam (4 oz, Quilted)', product_tmpl_id: [1, 'Apricot Freezer Jam'] });
    const b = odoo.create('product.product', { name: 'Apricot Freezer Jam', display_name: 'Apricot Freezer Jam (8 oz, Ball)', product_tmpl_id: [1, 'Apricot Freezer Jam'] });
    const z = odoo.create('product.product', { name: 'Apricot Halves', display_name: 'Apricot Halves', product_tmpl_id: [2, 'Apricot Halves'] });
    odoo.create('mrp.bom', { product_tmpl_id: [2, 'Apricot Halves'], product_id: false, product_qty: 1, bom_line_ids: [] });
    const rows = await searchProducts(c, 'apricot', true);
    expect(rows.map((r) => r.name)).toEqual(['Apricot Halves', 'Apricot Freezer Jam (4 oz, Quilted)', 'Apricot Freezer Jam (8 oz, Ball)']);
    expect(rows.map((r) => r.hasRecipe)).toEqual([true, false, false]);
    expect(rows.map((r) => r.id)).toEqual([z, a, b]);
    expect((await searchProducts(c, 'apricot')).map((r) => r.name)[0]).toBe('Apricot Freezer Jam (4 oz, Quilted)');
    // Copying a recipe to a new size: only the same product's own variants.
    expect((await searchProducts(c, '', true, false, 1)).map((r) => r.id)).toEqual([a, b]);
  });
});
