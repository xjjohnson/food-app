import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { editContactChange, editLotChange, editProductChange, loadProductDetail, newContactChange, newProductChange, searchContacts } from '../lib/edit';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

function kitchen(odoo: FakeOdoo) {
  const flour = odoo.create('product.product', { name: 'Flour', product_tmpl_id: [21, 'Flour'] });
  const sugar = odoo.create('product.product', { name: 'Sugar', product_tmpl_id: [22, 'Sugar'] });
  const cookie = odoo.create('product.product', { name: 'Cookies', product_tmpl_id: [20, 'Cookies'], list_price: 12, expiration_time: 14 });
  const tmpl = odoo.tables['product.template']!;
  odoo.tables['product.template'] = [...tmpl, { id: 20, name: 'Cookies', list_price: 12 }];
  const bom = odoo.create('mrp.bom', { product_tmpl_id: [20, 'Cookies'], product_id: [cookie, 'Cookies'], product_qty: 48, product_uom_id: [1, 'Units'], type: 'normal', bom_line_ids: [] });
  const l1 = odoo.create('mrp.bom.line', { bom_id: bom, product_id: [flour, 'Flour'], product_qty: 3, product_uom_id: [1, 'Units'], sequence: 10 });
  odoo.tables['mrp.bom']![0]!.bom_line_ids = [l1];
  return { flour, sugar, cookie, bom, l1 };
}

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('adding and changing things', () => {
  test('products: change the price and shelf life; add a new one without turning on tracking', async () => {
    const { odoo } = bakery();
    const k = kitchen(odoo);
    const c = await client(odoo);
    const p = (await loadProductDetail(c, k.cookie))!;
    expect(p).toMatchObject({ name: 'Cookies', price: 12, shelfLife: 14, hasShelfLife: true });
    await saveOrQueue(c, AsyncStorage, DB, 1, editProductChange(p, { name: 'Cookies', price: 13.5, shelfLife: 10 }));
    expect(odoo.tables['product.template']!.find((t) => t.id === 20)).toMatchObject({ list_price: 13.5, expiration_time: 10 });
    const ch = newProductChange({ name: 'Apple jelly', price: 8, shelfLife: 365 }, true);
    await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    const made = odoo.tables['product.template']!.find((t) => t.name === 'Apple jelly')!;
    expect(made).toMatchObject({ list_price: 8, expiration_time: 365 });
    expect(JSON.stringify(made)).not.toMatch(/tracking|storable/);
  });

  test('contacts: add, find and change', async () => {
    const { odoo } = bakery();
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, newContactChange({ name: 'Pat Customer', phone: '555-0100', email: '' }));
    const [pat] = await searchContacts(c, 'pat');
    expect(pat).toMatchObject({ name: 'Pat Customer', phone: '555-0100' });
    await saveOrQueue(c, AsyncStorage, DB, 1, editContactChange(pat!.id, { name: 'Pat C.', phone: '555-0199', email: 'pat@example.com' }));
    expect((await searchContacts(c, 'pat'))[0]).toMatchObject({ name: 'Pat C.', email: 'pat@example.com' });
  });

  test('a batch’s number and use-by date can be fixed', async () => {
    const { odoo } = bakery();
    const lot = odoo.create('stock.lot', { name: 'BAD-1', expiration_date: '2026-12-01 12:00:00' });
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, editLotChange(lot, { name: 'GOOD-1', useBy: '2026-12-09' }));
    expect(odoo.tables['stock.lot']![0]).toMatchObject({ name: 'GOOD-1', expiration_date: '2026-12-09 12:00:00' });
  });
});

describe('edit screens', () => {
  test('a baker changes an ingredient amount and saves the whole recipe once', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const k = kitchen(odoo);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'baker@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/production' });
    await settle();
    await fireEvent.press(screen.getByTestId('open-recipes'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`recipe-edit-${k.bom}`));
    await settle();
    await fireEvent.changeText(await screen.findByTestId(`line-qty-${k.l1}`), '4');
    await fireEvent.changeText(screen.getByTestId('recipe-makes'), '60');
    await fireEvent.changeText(screen.getByTestId('recipe-code'), 'COOK-1');
    await fireEvent.press(screen.getByTestId('save-recipe'));
    await settle();
    expect(odoo.tables['mrp.bom.line']!.find((l) => l.id === k.l1)!.product_qty).toBe(4);
    expect(odoo.tables['mrp.bom']![0]).toMatchObject({ product_qty: 60, code: 'COOK-1' });
  });

  test('a seller adds a customer from the app', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    odoo.addEmployee('Sam Seller', odoo.addUser({ login: 'sell@example.com' }).id, ['Sales']);
    odoo.declared['res.partner'] = ['name', 'phone', 'email', 'street', 'city'];
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'sell@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    await fireEvent.press(screen.getByTestId('open-contacts'));
    await settle();
    await fireEvent.press(screen.getByTestId('new-contact'));
    await fireEvent.changeText(await screen.findByTestId('f-name'), 'Lee Market');
    await fireEvent.changeText(screen.getByTestId('f-phone'), '555-0123');
    await fireEvent.press(screen.getByTestId('save-form'));
    await settle();
    expect(odoo.tables['res.partner']!.some((r) => r.name === 'Lee Market' && r.phone === '555-0123')).toBe(true);
  });
});
