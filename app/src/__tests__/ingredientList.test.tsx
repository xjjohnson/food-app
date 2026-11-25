import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { addVendorChange, editIngredientChange, editVendorChange, loadCategories, loadIngredient, loadIngredients, loadPurchaseTaxes, loadUnits, newIngredientChange, removeVendorChange } from '../lib/ingredientList';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { saveOrQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

function larder(odoo: FakeOdoo) {
  const raw = odoo.create('product.category', { name: 'Raw Material', complete_name: 'All / Raw Material' });
  const goods = odoo.create('product.category', { name: 'Finished', complete_name: 'All / Finished' });
  const tax = odoo.create('account.tax', { name: '8.25% Texas', type_tax_use: 'purchase' });
  const lb = odoo.create('uom.uom', { name: 'lb' });
  const berries = odoo.create('product.template', { name: 'Black Rasberries', categ_id: [raw, 'Raw Material'], uom_id: [lb, 'lb'], qty_available: 11.66, standard_price: 2.41, product_variant_count: 1, purchase_ok: true, supplier_taxes_id: [tax], is_storable: true, seller_ids: [] });
  const jam = odoo.create('product.template', { name: 'Jelly', categ_id: [goods, 'Finished'], uom_id: [lb, 'lb'], qty_available: 3, standard_price: 1, product_variant_count: 1, purchase_ok: false });
  const heb = odoo.create('res.partner', { name: 'heb' });
  return { raw, goods, tax, lb, berries, jam, heb };
}

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('ingredient list lib', () => {
  test('lists what Odoo can buy, and reads categories, units and purchase taxes', async () => {
    const { odoo } = bakery();
    const l = larder(odoo);
    const c = await client(odoo);
    expect((await loadIngredients(c, l.raw, '')).map((i) => i.name)).toEqual(['Black Rasberries']);
    expect((await loadCategories(c)).map((x) => x.name)).toContain('All / Raw Material');
    expect((await loadUnits(c))[0]!.name).toBe('lb');
    expect((await loadPurchaseTaxes(c))[0]!.name).toBe('8.25% Texas');
    const b = (await loadIngredient(c, l.berries))!;
    expect(b).toMatchObject({ name: 'Black Rasberries', cost: 2.41, unit: 'lb', tracked: true, taxIds: [l.tax], vendors: [] });
  });

  test('changing an ingredient, and adding, changing and removing a vendor line', async () => {
    const { odoo } = bakery();
    const l = larder(odoo);
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, editIngredientChange(l.berries, { name: 'Black Raspberries', categoryId: l.raw, cost: 2.5, taxIds: [], reference: 'BR', barcode: '' }));
    expect(odoo.tables['product.template']!.find((t) => t.id === l.berries)).toMatchObject({ name: 'Black Raspberries', standard_price: 2.5, supplier_taxes_id: [], default_code: 'BR', barcode: false });
    await saveOrQueue(c, AsyncStorage, DB, 1, addVendorChange(l.berries, 'Black Raspberries', { partnerId: l.heb, vendor: 'heb', price: 2.37, minQty: 1, days: 0 }));
    let b = (await loadIngredient(c, l.berries))!;
    expect(b.vendors).toMatchObject([{ vendor: 'heb', price: 2.37, minQty: 1, days: 0 }]);
    await saveOrQueue(c, AsyncStorage, DB, 1, editVendorChange(b.vendors[0]!, b.name, { price: 2.2, minQty: 2, days: 3 }));
    b = (await loadIngredient(c, l.berries))!;
    expect(b.vendors[0]).toMatchObject({ price: 2.2, minQty: 2, days: 3 });
    await saveOrQueue(c, AsyncStorage, DB, 1, removeVendorChange(b.vendors[0]!, b.name));
    expect((await loadIngredient(c, l.berries))!.vendors).toEqual([]);
  });

  test('a new ingredient is buyable, not for sale, and made without Track Inventory', async () => {
    const { odoo } = bakery();
    const l = larder(odoo);
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, newIngredientChange({ name: 'Butter', categoryId: l.raw, cost: 3, taxIds: [l.tax], reference: '', barcode: '' }, l.lb));
    const made = odoo.tables['product.template']!.find((t) => t.name === 'Butter')!;
    expect(made).toMatchObject({ purchase_ok: true, sale_ok: false, standard_price: 3, uom_id: l.lb, categ_id: l.raw });
    expect(JSON.stringify(made)).not.toMatch(/storable|tracking/);
  });
});

describe('ingredient list screen', () => {
  test('a baker opens the list, changes a cost and adds a vendor', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const l = larder(odoo);
    odoo.addEmployee('Ivy Inventory', odoo.addUser({ login: 'inv@example.com' }).id, ['Inventory']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'inv@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/ingredients' });
    await settle();
    await fireEvent.press(screen.getByTestId('ing-list'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`ingredient-${l.berries}`));
    await settle();
    await fireEvent.changeText(await screen.findByTestId('ingredient-cost'), '2.9');
    await fireEvent.press(screen.getByTestId('save-ingredient'));
    await settle();
    expect(odoo.tables['product.template']!.find((t) => t.id === l.berries)!.standard_price).toBe(2.9);
    await fireEvent.press(screen.getByTestId('add-vendor'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`vendor-pick-${l.heb}`));
    await fireEvent.changeText(screen.getByTestId('vendor-price'), '2.37');
    await fireEvent.press(screen.getByTestId('save-vendor'));
    await settle();
    expect(odoo.tables['product.supplierinfo']).toHaveLength(1);
    expect(odoo.tables['product.supplierinfo']![0]).toMatchObject({ price: 2.37, product_tmpl_id: l.berries });
  });
});
