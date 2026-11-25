import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { lookupGroups, stockByBatchOf } from '../lib/lookup';
import { log } from '../lib/log';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { allFields, blankValue, changedValues, loadDraft, looksLikeHtml } from '../lib/odooForm';
import { loadVariants, PRODUCT_SECTIONS, VARIANT_SECTIONS } from '../lib/productForm';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function jam(odoo: FakeOdoo) {
  odoo.declared['product.template'] = allFields(PRODUCT_SECTIONS).map((f) => f.name);
  odoo.declared['product.product'] = allFields(VARIANT_SECTIONS).map((f) => f.name);
  odoo.tables['product.template'] = [{ id: 30, name: 'Apricot Freezer Jam', list_price: 8, qty_available: 239, product_variant_count: 2, color: 0, public_description: '<div data-oe-version=2.0>A quick and easy jam</div>' }];
  const a = odoo.create('product.product', { name: 'Apricot Freezer Jam', display_name: 'Apricot Freezer Jam (4 oz)', product_tmpl_id: [30, 'x'], qty_available: 239, barcode: '' });
  const b = odoo.create('product.product', { name: 'Apricot Freezer Jam', display_name: 'Apricot Freezer Jam (8 oz)', product_tmpl_id: [30, 'x'], qty_available: 0, barcode: '' });
  const lot = odoo.create('stock.lot', { name: 'AJ-1', product_id: [a, 'x'], expiration_date: '2027-01-01 12:00:00' });
  odoo.create('stock.quant', { product_id: [a, 'x'], lot_id: [lot, 'AJ-1'], quantity: 239, 'location_id.usage': 'internal' });
  return { a, b };
}

describe('variants live on the product', () => {
  test('one row per product with the total, and its variants and batches', async () => {
    const { odoo } = bakery();
    const k = jam(odoo);
    const c = await client(odoo);
    const groups = await lookupGroups(c, 'jam');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'Apricot Freezer Jam', onHand: 239, variants: 2 });
    expect((await loadVariants(c, 30)).map((v) => [v.name, v.onHand])).toEqual([['Apricot Freezer Jam (4 oz)', 239], ['Apricot Freezer Jam (8 oz)', 0]]);
    expect((await stockByBatchOf(c, 30)).map((b) => [b.lot, b.qty])).toEqual([['AJ-1', 239]]);
    expect(k.a).toBeGreaterThan(0);
  });

  test('a variant opens from the product and its barcode is saved', async () => {
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
    expect(await screen.findByTestId('product-30')).toHaveTextContent(/2 variants/);
    await fireEvent.press(screen.getByTestId('open-product-30'));
    await settle();
    await fireEvent.press(screen.getByTestId('edit-product-30'));
    await settle();
    await fireEvent.press(await screen.findByTestId('form-tabs-batches'));
    await fireEvent.press(await screen.findByTestId(`variant-${k.b}`));
    await settle();
    await fireEvent.changeText(await screen.findByTestId('f-barcode'), '12345');
    await fireEvent.press(screen.getByTestId('save-form'));
    await settle();
    expect(odoo.tables['product.product']!.find((p) => p.id === k.b)!.barcode).toBe('12345');
  });
});

describe('packagings that Odoo does not have', () => {
  test('say so in plain words instead of an error', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    jam(odoo);
    odoo.refuse['product.packaging.fields_get'] = "Object product.packaging doesn't exist";
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
    await fireEvent.press(await screen.findByTestId('open-product-30'));
    await settle();
    await fireEvent.press(screen.getByTestId('edit-product-30'));
    await settle();
    await fireEvent.press(await screen.findByTestId('form-tabs-packs'));
    await fireEvent.press(await screen.findByTestId('product-packs'));
    await settle();
    expect(screen.getByText(/no Packagings list/)).toBeTruthy();
    expect(screen.queryByText(/Couldn’t read the lines/)).toBeNull();
  });
});

describe('descriptions and colors', () => {
  test('HTML shows as plain text and the color is a number 0 to 11', async () => {
    const { odoo } = bakery();
    jam(odoo);
    const c = await client(odoo);
    const defs = allFields(PRODUCT_SECTIONS);
    const before = await loadDraft(c, 'product.template', 30, defs);
    expect(before.public_description).toBe('A quick and easy jam');
    expect(looksLikeHtml('<p>x</p>')).toBe(true);
    expect(looksLikeHtml('1 < 2 and 3 > 2')).toBe(false);
    const d = { ...before, color: '4', public_description: 'Tangy\nand sweet' };
    expect(changedValues(defs, before, d)).toEqual({ color: 4, public_description: '<p>Tangy</p><p>and sweet</p>' });
    expect(blankValue(defs.find((f) => f.name === 'color')!)).toBe('');
  });
});

describe('the log', () => {
  test('quick reads that worked are left out; writes and failures are kept', async () => {
    log.clear();
    const { odoo } = bakery();
    const c = await client(odoo);
    await c.call('res.partner', 'search_read', [[]], { fields: ['name'] });
    await c.call('res.partner', 'create', [{ name: 'Ann' }]);
    odoo.refuse['res.partner.write'] = 'no';
    await c.call('res.partner', 'write', [[1], { name: 'B' }]).catch(() => undefined);
    const text = log.all().map((e) => `${e.level} ${e.msg}`).join('\n');
    expect(text).not.toMatch(/res\.partner\.search_read ok/);
    expect(text).toMatch(/res\.partner\.create ok/);
    expect(text).toMatch(/error res\.partner\.write failed/);
  });
});
