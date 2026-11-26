import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY } from '../lib/odoo';
import { deviceSecrets } from '../lib/secrets';
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

/** A cookie recipe that makes 48. */
function recipe(odoo: FakeOdoo) {
  const flour = odoo.create('product.product', { name: 'Flour', free_qty: 5 });
  const cookie = odoo.create('product.product', { name: 'Chocolate chip cookies', free_qty: 0 });
  const bom = odoo.create('mrp.bom', { product_tmpl_id: [1, 'Chocolate chip cookies'], product_id: [cookie, 'Chocolate chip cookies'], product_qty: 48, product_uom_id: [1, 'Units'], type: 'normal' });
  const l1 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [flour, 'Flour'], product_qty: 3 });
  odoo.tables['mrp.bom']![0]!.bom_line_ids = [l1];
  return bom;
}

describe('the Make tab', () => {
  test('shows the recipe box and opens a recipe in the cookbook look', async () => {
    const { odoo } = bakery();
    const bom = recipe(odoo);
    await open(odoo, '/', 'Production');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    expect(screen.getByTestId('recipe-box')).toBeTruthy();
    expect(screen.getByTestId(`make-recipe-${bom}`)).toHaveTextContent(/Chocolate chip cookies/);
    await fireEvent.press(screen.getByTestId(`make-recipe-${bom}`));
    await settle();
    // The recipe page opened directly, not the Production menu.
    expect(screen.queryByTestId('production-screen')).toBeNull();
    expect(screen.queryByTestId('recipes-screen')).toBeNull();
  });

  test('has Batches and Jars in stock segments for the owner, and Jars only for inventory', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-seg-batches'));
    expect(screen.getByTestId('make-start-batch')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('make-seg-jars'));
    expect(screen.getByTestId('area-stock')).toBeTruthy();
  });

  test('inventory sees jars in stock, no recipe box', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Inventory');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    expect(screen.queryByTestId('recipe-box')).toBeNull();
    expect(screen.getByTestId('area-stock')).toBeTruthy();
  });
});
