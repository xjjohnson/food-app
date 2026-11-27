import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY } from '../lib/odoo';
import { TABS } from '../lib/tabs';
import { forgetStarted } from '../screens/ProductionScreen';
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
    await fireEvent.press(screen.getByTestId('make-open-recipes'));
    await settle();
    expect(screen.getByTestId('recipe-box')).toBeTruthy();
    expect(screen.getByTestId('recipe-box')).toHaveTextContent(/Chocolate chip cookies/);
    await fireEvent.press(screen.getByTestId(`make-recipe-${bom}`));
    await settle();
    // The recipe page opened directly, not the Production menu.
    expect(screen.queryByTestId('production-screen')).toBeNull();
    expect(screen.queryByTestId('recipes-screen')).toBeNull();
  });

  test('the owner’s Make home has doors to Batches, Recipes and Jars in stock, each its own page with Back', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    expect(screen.getByTestId('make-start-batch')).toBeTruthy();
    expect(screen.getByTestId('make-stats')).toBeTruthy();
    expect(screen.queryByTestId('make-seg')).toBeNull();
    await fireEvent.press(screen.getByTestId('make-open-batches'));
    await settle();
    expect(screen.getByTestId('make-batches-screen')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back'));
    await settle();
    expect(screen.getByTestId('tab-screen-make')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('make-open-jars'));
    await settle();
    expect(screen.getByTestId('area-stock')).toBeTruthy();
  });

  test('inventory sees jars in stock, no recipe box', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Inventory');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    expect(screen.queryByTestId('make-open-recipes')).toBeNull();
    expect(screen.queryByTestId('make-open-batches')).toBeNull();
    await fireEvent.press(screen.getByTestId('make-open-jars'));
    await settle();
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
    // Back goes to the Buy tab, not to the Ingredients menu.
    await fireEvent.press(screen.getByTestId('back'));
    await settle();
    expect(screen.getByTestId('tab-screen-buy')).toBeTruthy();
    expect(screen.queryByTestId('ingredients-screen')).toBeNull();
  });

  test('Sell is one page with a Market row that opens the numbered Market steps', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-sell'));
    await settle();
    expect(screen.getByTestId('sell-board')).toBeTruthy();
    expect(screen.queryByTestId('sell-seg')).toBeNull();
    await fireEvent.press(screen.getByTestId('area-market'));
    await settle();
    expect(screen.getByTestId('market-screen')).toBeTruthy();
    expect(screen.queryByTestId('market-price')).toBeNull();
    expect(screen.queryByTestId('market-drawer')).toBeNull();
    await fireEvent.press(screen.getByTestId('market-sheet'));
    await settle();
    expect(screen.getByTestId('daysheet-page')).toBeTruthy();
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
    odoo.create('mrp.production', { name: 'MO/1', state: 'progress', product_id: [jam, 'Jam'], product_qty: 12 });
    odoo.create('mrp.production', { name: 'MO/2', state: 'draft', product_id: [jam, 'Jam'], product_qty: 6 });
    await open(odoo, '/', 'Production');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-open-batches'));
    await settle();
    expect(screen.getByTestId('make-stages-planned')).toHaveTextContent('Planned (1)');
    expect(screen.getByTestId('make-stages-cooking')).toHaveTextContent('Cooking (1)');
    // Opens on Planned (the first stage with a batch); Cooking shows the other batch.
    expect(screen.queryByText(/MO\/1/)).toBeNull();
    await fireEvent.press(screen.getByTestId('make-stages-cooking'));
    expect(screen.getByText(/MO\/1/)).toBeTruthy();
    expect(screen.getByTestId('make-stages-done')).toBeTruthy();
  });
});

describe('no doubles', () => {
  test('one place for each thing: no Everything-in rows, no Search or Contacts in More', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-buy'));
    await settle();
    expect(screen.queryByTestId('area-ingredients')).toBeNull();
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    expect(screen.queryByTestId('open-search')).toBeNull();
    expect(screen.queryByTestId('open-contacts-more')).toBeNull();
    expect(screen.getByTestId('open-management')).toBeTruthy();
  });

  test('the delivery board opens from Sell and Back returns to Sell', async () => {
    const { odoo } = bakery();
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-sell'));
    await settle();
    await fireEvent.press(screen.getByTestId('sell-board'));
    await settle();
    expect(screen.getByTestId('board-screen')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back'));
    await settle();
    expect(screen.getByTestId('tab-screen-sell')).toBeTruthy();
    expect(screen.queryByTestId('board-screen')).toBeNull();
  });
});

describe('Make fixes', () => {
  beforeEach(() => forgetStarted());

  test('the tabs run Today, Buy, Make, Sell, More', () => {
    expect(TABS.map((t) => t.id)).toEqual(['index', 'buy', 'make', 'sell', 'more']);
  });

  test('Make home has Food safety and the tools, Recipes has the recipe box, and no Find a product card on any tab', async () => {
    const { odoo } = bakery();
    recipe(odoo);
    await open(odoo, '/', 'Production');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    expect(screen.getByTestId('make-plan')).toBeTruthy();
    expect(screen.getByTestId('make-week')).toBeTruthy();
    expect(screen.queryByTestId('recipe-box')).toBeNull();
    expect(screen.queryByTestId('open-lookup')).toBeNull();
    await fireEvent.press(screen.getByTestId('make-open-recipes'));
    await settle();
    expect(screen.getByTestId('recipe-box')).toBeTruthy();
    expect(screen.queryByTestId('open-lookup')).toBeNull();
  });

  test('Start a batch opens the new batch, and a second start a minute later asks first', async () => {
    const { odoo } = bakery();
    const bom = recipe(odoo);
    await open(odoo, '/', 'Production');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-start-batch'));
    await settle();
    await fireEvent.press(screen.getByTestId(`recipe-${bom}`));
    await settle();
    await fireEvent.press(screen.getByTestId('confirm-start'));
    await settle();
    expect(odoo.tables['mrp.production']).toHaveLength(1);
    expect(screen.getByTestId('batch-state')).toHaveTextContent(/Odoo: Confirmed/);
    expect(screen.getByText(/Batch started/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Back to batches'));
    await settle();
    // Back leaves for the Make tab, and the Batches page lists the new batch.
    expect(screen.getByTestId('make-stats')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('make-open-batches'));
    await settle();
    expect(screen.getByTestId(`make-batch-${odoo.tables['mrp.production']![0]!.id}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-start-batch'));
    await settle();
    await fireEvent.press(screen.getByTestId(`recipe-${bom}`));
    await settle();
    await fireEvent.press(screen.getByTestId('confirm-start'));
    await settle();
    expect(screen.getByText(/started this recipe a minute ago/)).toBeTruthy();
    expect(odoo.tables['mrp.production']).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('confirm-start'));
    await settle();
    expect(odoo.tables['mrp.production']).toHaveLength(2);
  });

  test('plan for later saves a planned batch, not a started one', async () => {
    const { odoo } = bakery();
    const bom = recipe(odoo);
    await open(odoo, '/', 'Production');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-start-batch'));
    await settle();
    await fireEvent.press(screen.getByTestId(`recipe-${bom}`));
    await settle();
    await fireEvent.press(screen.getByTestId('batch-when-later'));
    await fireEvent.press(screen.getByTestId('confirm-start'));
    await settle();
    expect(odoo.tables['mrp.production']![0]!.state).toBe('draft');
  });

  test('Jars in stock lists the finished jars with how many there are', async () => {
    const { odoo } = bakery();
    odoo.create('product.product', { name: 'Peach Jam', free_qty: 11, qty_available: 11, uom_id: [1, 'Units'] });
    await open(odoo, '/', 'Owner');
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-open-jars'));
    await settle();
    expect(screen.getByTestId('make-jars')).toHaveTextContent(/Peach Jam/);
    expect(screen.getByTestId('make-jars')).toHaveTextContent(/11 in stock/);
    expect(screen.getByTestId('area-stock')).toBeTruthy();
  });
});

import { groupRecipes, qtyWords, Recipe } from '../lib/production';
test('counts read in plain words', () => {
  expect(qtyWords(20, 'Pack of 6')).toBe('20 packs of 6');
  expect(qtyWords(1, 'Pack of 6')).toBe('1 pack of 6');
  expect(qtyWords(1, 'Units')).toBe('1 unit');
  expect(qtyWords(12, 'Jars')).toBe('12 Jars');
  expect(qtyWords(3)).toBe('3');
});

test('recipes group by product with the size listed under it', () => {
  const r = (id: number, name: string) => ({ id, name, makes: 1, unit: 'Units', lines: [] } as unknown as Recipe);
  const g = groupRecipes([r(1, 'Apricot Jam (4 oz, Quilted)'), r(2, 'Apricot Jam (8 oz, Quilted)'), r(3, 'Salsa')]);
  expect(g.map((x) => x.name)).toEqual(['Apricot Jam', 'Salsa']);
  expect(g[0]!.recipes.map((x) => x.size)).toEqual(['4 oz, Quilted', '8 oz, Quilted']);
  expect(g[1]!.recipes[0]!.size).toBe('');
  expect(groupRecipes([r(1, 'Apricot Jam (4 oz, Quilted)'), r(3, 'Salsa')], 'sal').map((x) => x.name)).toEqual(['Salsa']);
});

describe('the batch page next step', () => {
  async function openBatch(odoo: FakeOdoo, state: string) {
    const jam = odoo.create('product.product', { name: 'Jam', free_qty: 0 });
    const id = odoo.create('mrp.production', { name: 'WH/MO/9', state, product_id: [jam, 'Jam'], product_qty: 12 });
    await open(odoo, `/area/production?go=batch:${id}`, 'Production');
    return id;
  }

  test('a confirmed batch shows the steps, and Finish says what is missing until it is filled in', async () => {
    const { odoo } = bakery();
    await openBatch(odoo, 'confirmed');
    expect(screen.getByTestId('batch-state')).toHaveTextContent(/Ready to cook \(Odoo: Confirmed\)/);
    expect(screen.getByTestId('batch-step-0')).toHaveTextContent('✓ Planned');
    expect(screen.getByTestId('batch-step-1')).toHaveTextContent('● Cooking');
    expect(screen.getByTestId('batch-step-2')).toHaveTextContent('○ Finish');
    await fireEvent.changeText(screen.getByTestId('lot-name'), '');
    await settle();
    expect(screen.getByTestId('finish-reasons')).toHaveTextContent(/Batch number is empty/);
    expect(screen.getByTestId('finish-batch')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('lot-name'), 'J-1');
    await settle();
    expect(screen.queryByTestId('finish-reasons')).toBeNull();
    expect(screen.getByTestId('finish-batch')).toBeEnabled();
  });

  test('a planned batch has a Confirm button that confirms it in Odoo', async () => {
    const { odoo } = bakery();
    const id = await openBatch(odoo, 'draft');
    expect(screen.getByTestId('batch-step-0')).toHaveTextContent('● Planned');
    await fireEvent.press(screen.getByTestId('batch-confirm'));
    await settle();
    expect(odoo.tables['mrp.production']!.find((m) => m.id === id)!.state).toBe('confirmed');
    expect(screen.getByTestId('batch-step-1')).toHaveTextContent('● Cooking');
  });

  test('Start cooking ticks the ingredients as picked in Odoo, which is how Odoo moves the order to In Progress', async () => {
    const { odoo } = bakery();
    const jam = odoo.create('product.product', { name: 'Jam', free_qty: 0 });
    const flour = odoo.create('product.product', { name: 'Flour', free_qty: 5 });
    const mv = odoo.create('stock.move', { product_id: [flour, 'Flour'], product_uom_qty: 3, state: 'assigned', picked: false });
    const id = odoo.create('mrp.production', { name: 'WH/MO/8', state: 'confirmed', product_id: [jam, 'Jam'], product_qty: 12, move_raw_ids: [mv] });
    await open(odoo, `/area/production?go=batch:${id}`, 'Production');
    await fireEvent.press(screen.getByTestId('batch-start-cooking'));
    await settle();
    expect(odoo.tables['stock.move']!.find((m) => m.id === mv)!.picked).toBe(true);
  });
});

describe('the use-by date', () => {
  async function batch(odoo: FakeOdoo) {
    const jam = odoo.create('product.product', { name: 'Jam', free_qty: 0 });
    const id = odoo.create('mrp.production', { name: 'WH/MO/7', state: 'confirmed', product_id: [jam, 'Jam'], product_qty: 12 });
    await open(odoo, `/area/production?go=batch:${id}`, 'Production');
  }

  test('it is filled in (six months when nothing else is set) and the shortcuts and calendar change it', async () => {
    const { odoo } = bakery();
    await batch(odoo);
    const label = () => String(screen.getByTestId('use-by').props.accessibilityLabel);
    expect(label()).toMatch(/Use by: \d{4}-\d{2}-\d{2}/);
    expect(screen.getByText(/starts at six months/)).toBeTruthy();
    const six = label();
    await fireEvent.press(screen.getByTestId('useby-12m'));
    expect(label()).not.toBe(six);
    await fireEvent.press(screen.getByTestId('use-by'));
    await fireEvent.press(screen.getByTestId('date-day-15'));
    expect(label()).toMatch(/-15$/);
  });

  test('the owner’s default shelf life is used when the product has none', async () => {
    const { odoo } = bakery();
    odoo.create('res.partner', { name: 'Food app settings', comment: '<p>shelfLifeDays=90</p>' });
    await batch(odoo);
    expect(screen.getByText(/uses your default of 90 days/)).toBeTruthy();
  });
});

import { addMonths, useByStart } from '../lib/production';
test('use-by start: product shelf life, then the default, then six months', () => {
  const today = new Date(2026, 10, 26);
  expect(useByStart(30, 90, today)).toEqual({ date: '2026-12-26', source: 'product', days: 30 });
  expect(useByStart(null, 90, today)).toEqual({ date: '2027-02-24', source: 'default', days: 90 });
  expect(useByStart(null, null, today)).toEqual({ date: '2027-05-26', source: 'fallback', days: null });
  expect(addMonths(new Date(2026, 7, 31), 6)).toBe('2027-02-28');
});
