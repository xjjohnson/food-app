import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { CONTACT_SECTIONS, LOT_SECTIONS } from '../lib/forms';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { allFields, blankValue, changedValues, formProblems, loadDraft, onlyPresent, presentFields } from '../lib/odooForm';
import { PRODUCT_SECTIONS } from '../lib/productForm';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function jam(odoo: FakeOdoo) {
  odoo.declared['product.template'] = allFields(PRODUCT_SECTIONS).map((f) => f.name).filter((n) => !['to_weight', 'pos_categ_ids', 'color', 'public_description', 'pos_optional_product_ids', 'is_published'].includes(n));
  const tax = odoo.create('account.tax', { name: 'Sales 8.25%', type_tax_use: 'sale' });
  odoo.tables['product.template'] = [{ id: 30, name: 'Apricot Freezer Jam', list_price: 8, sale_ok: true, is_storable: false, tracking: 'none', use_expiration_date: false, expiration_time: 0, taxes_id: [], qty_available: 3, product_variant_count: 1 }];
  const prod = odoo.create('product.product', { name: 'Apricot Freezer Jam', display_name: 'Apricot Freezer Jam', product_tmpl_id: [30, 'Apricot Freezer Jam'], list_price: 8, qty_available: 3 });
  return { tax, prod, tmpl: 30 };
}

describe('Odoo forms', () => {
  test('fields this Odoo does not have are left out, and empty tabs go away', async () => {
    const { odoo } = bakery();
    jam(odoo);
    const have = await presentFields(await client(odoo), 'product.template');
    const secs = onlyPresent(PRODUCT_SECTIONS, have);
    expect(secs.find((s) => s.id === 'pos')).toBeUndefined();
    expect(allFields(secs).some((f) => f.name === 'is_published')).toBe(false);
    expect(allFields(secs).some((f) => f.name === 'is_storable')).toBe(true);
  });

  test('only what changed is written, and tracking can be switched on by the person', async () => {
    const { odoo } = bakery();
    jam(odoo);
    const c = await client(odoo);
    const defs = allFields(onlyPresent(PRODUCT_SECTIONS, await presentFields(c, 'product.template')));
    const before = await loadDraft(c, 'product.template', 30, defs);
    expect(changedValues(defs, before, { ...before })).toEqual({});
    const d = { ...before, is_storable: true, tracking: 'lot', use_expiration_date: true, expiration_time: '120', taxes_id: [{ id: 1, name: 'Sales 8.25%' }], description_sale: 'Sweet\nand easy' };
    expect(changedValues(defs, before, d)).toEqual({ is_storable: true, tracking: 'lot', use_expiration_date: true, expiration_time: 120, taxes_id: [[6, 0, [1]]], description_sale: 'Sweet\nand easy' });
  });

  test('problems are named in plain words', () => {
    const defs = allFields(PRODUCT_SECTIONS).concat(allFields(LOT_SECTIONS));
    const d = Object.fromEntries(defs.map((f) => [f.name, blankValue(f)]));
    expect(formProblems(defs, { ...d, name: '', list_price: 'abc', expiration_time: '1.5', expiration_date: '12/25' }, ['name']).join(' ')).toMatch(/Name is needed.*Price should be a number.*whole number.*year-month-day/);
  });

  test('dates go to Odoo as a date and time, contacts have an address', () => {
    const defs = allFields(LOT_SECTIONS);
    const d = Object.fromEntries(defs.map((f) => [f.name, blankValue(f)]));
    expect(changedValues(defs, d, { ...d, expiration_date: '2027-01-28' }, true)).toEqual({ expiration_date: '2027-01-28 12:00:00' });
    expect(allFields(CONTACT_SECTIONS).map((f) => f.name)).toEqual(expect.arrayContaining(['street', 'city', 'zip', 'country_id', 'vat']));
  });
});

describe('product screen', () => {
  test('a baker switches on tracking and expiry for a product and saves once', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const k = jam(odoo);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'baker@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/lookup' });
    await settle();
    await fireEvent.press(await screen.findByTestId(`open-product-${k.tmpl}`));
    await settle();
    await fireEvent.press(screen.getByTestId(`edit-product-${k.tmpl}`));
    await settle();
    await fireEvent.press(await screen.findByTestId('form-tabs-stock'));
    await fireEvent(screen.getByTestId('f-is_storable'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('f-tracking-lot'));
    await fireEvent(screen.getByTestId('f-use_expiration_date'), 'valueChange', true);
    await fireEvent.changeText(screen.getByTestId('f-expiration_time'), '120');
    await fireEvent.press(screen.getByTestId('form-tabs-main'));
    await fireEvent.press(screen.getByTestId('f-taxes_id-add'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`relation-${k.tax}`));
    await fireEvent.press(screen.getByTestId('relation-done'));
    await settle();
    await fireEvent.press(screen.getByTestId('save-form'));
    await settle();
    expect(odoo.tables['product.template']![0]).toMatchObject({ is_storable: true, tracking: 'lot', use_expiration_date: true, expiration_time: 120, taxes_id: [k.tax] });
  });
});

async function open(odoo: FakeOdoo, url: string, role = 'Inventory') {
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
const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
};

describe('other screens', () => {
  test('a purchase order can be opened and its details changed', async () => {
    const { odoo } = bakery();
    odoo.declared['purchase.order'] = ['partner_id', 'partner_ref', 'date_order', 'date_planned', 'notes', 'origin'];
    const po = odoo.create('purchase.order', { name: 'P00007', partner_id: [5, 'HEB'], state: 'draft', partner_ref: '', date_order: '2026-11-20 10:00:00', date_planned: false, notes: false, origin: false });
    await open(odoo, '/area/ingredients');
    await fireEvent.press(screen.getByTestId('ing-pos'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`po-${po}`));
    await settle();
    await fireEvent.changeText(await screen.findByTestId('f-partner_ref'), 'INV-9');
    await fireEvent.changeText(screen.getByTestId('f-date_planned'), '2026-12-01');
    await fireEvent.press(screen.getByTestId('save-form'));
    await settle();
    expect(odoo.tables['purchase.order']![0]).toMatchObject({ partner_ref: 'INV-9', date_planned: '2026-12-01 12:00:00' });
  });

  test('a batch can be added with its dates from Find a batch', async () => {
    const { odoo } = bakery();
    const p = odoo.create('product.product', { name: 'Jam', display_name: 'Jam' });
    odoo.declared['stock.lot'] = ['name', 'product_id', 'ref', 'expiration_date', 'use_date', 'removal_date', 'alert_date', 'note'];
    await open(odoo, '/area/stock');
    await fireEvent.press(screen.getByTestId('stock-find'));
    await settle();
    await fireEvent.press(await screen.findByTestId('new-lot'));
    await settle();
    await fireEvent.changeText(await screen.findByTestId('f-name'), '261125-01');
    await fireEvent.changeText(screen.getByTestId('f-expiration_date'), '2027-03-25');
    await fireEvent.press(screen.getByTestId('f-product_id'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`relation-${p}`));
    await fireEvent.press(screen.getByTestId('save-form'));
    await settle();
    expect(odoo.tables['stock.lot']![0]).toMatchObject({ name: '261125-01', product_id: p, expiration_date: '2027-03-25 12:00:00' });
  });
});
