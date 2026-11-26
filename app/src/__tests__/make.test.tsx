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

describe('the Buy and Sell tabs', () => {
  test('Buy opens the Bought ingredients page in one tap', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Inventory');
    await fireEvent.press(screen.getByTestId('tab-buy'));
    await settle();
    await fireEvent.press(screen.getByTestId('buy-bought'));
    await settle();
    expect(screen.getByTestId('bought-screen')).toBeTruthy();
  });

  test('Sell has market day as big buttons, and a day sheet tile opens that page', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-sell'));
    await settle();
    expect(screen.getByTestId('sell-seg-delivery')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sell-seg-market'));
    expect(screen.getByTestId('market-tiles')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('market-tile-price'));
    await settle();
    expect(screen.queryByTestId('market-screen')).toBeNull();
    expect(screen.queryByTestId('market-tiles')).toBeNull();
  });
});

describe('Money and reports', () => {
  test('opens on this month’s numbers, from Odoo’s own totals', async () => {
    const { odoo } = bakery();
    const jelly = odoo.create('product.product', { name: 'Grape jelly', display_name: 'Grape jelly', sale_ok: true, standard_price: 2, list_price: 6 });
    const today = new Date().toISOString().slice(0, 10);
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 5, price_subtotal: 30, date: `${today} 10:00:00`, state: 'sale' });
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    await fireEvent.press(screen.getByTestId('open-reports'));
    await settle();
    expect(screen.getByTestId('numbers-sold')).toHaveTextContent('30.00');
    expect(screen.getByTestId('numbers-units')).toHaveTextContent('5');
  });
});

describe('boards with stages', () => {
  test('Make, Batches shows a stage strip and opens on the first stage with a batch', async () => {
    const { odoo } = bakery();
    const jam = odoo.create('product.product', { name: 'Jam', free_qty: 0 });
    odoo.create('mrp.production', { name: 'MO/1', state: 'confirmed', product_id: [jam, 'Jam'], product_qty: 12 });
    odoo.create('mrp.production', { name: 'MO/2', state: 'draft', product_id: [jam, 'Jam'], product_qty: 6 });
    await open(odoo, '/', 'Production');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-seg-batches'));
    expect(screen.getByTestId('make-stages-planned')).toHaveTextContent('Planned (1)');
    expect(screen.getByTestId('make-stages-cooking')).toHaveTextContent('Cooking (1)');
    // Opens on Planned (the first stage with a batch); Cooking shows the other batch.
    expect(screen.queryByText(/MO\/1/)).toBeNull();
    await fireEvent.press(screen.getByTestId('make-stages-cooking'));
    expect(screen.getByText(/MO\/1/)).toBeTruthy();
  });
});
