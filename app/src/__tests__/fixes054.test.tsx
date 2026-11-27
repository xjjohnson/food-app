import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { loadAppearance, saveAppearance } from '../lib/appearance';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadSold } from '../lib/reports';
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

describe('more page redesign', () => {
  test('the delivery charge is left out of what sold', async () => {
    const { odoo } = bakery();
    const jelly = odoo.create('product.product', { name: 'Grape jelly', standard_price: 2 });
    const ship = odoo.create('product.product', { name: 'Delivery', standard_price: 0 });
    odoo.create('delivery.carrier', { name: 'Local delivery', product_id: [ship, 'Delivery'] });
    odoo.create('sale.report', { product_id: [jelly, 'Grape jelly'], product_uom_qty: 4, price_subtotal: 24, date: '2026-11-10 10:00:00', state: 'sale' });
    odoo.create('sale.report', { product_id: [ship, 'Delivery'], product_uom_qty: 1, price_subtotal: 5, date: '2026-11-10 10:00:00', state: 'sale' });
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    const sold = await loadSold(c, '2026-11-01', '2026-11-26');
    expect(sold.map((r) => r.name)).toEqual(['Grape jelly']);
  });

  test('the owner sees the header, quick buttons and the owner-only box; the look is kept on the phone', async () => {
    const { odoo } = bakery();
    await open(odoo, '/more', 'owner');
    expect(screen.getByTestId('more-header')).toBeTruthy();
    expect(screen.getByTestId('open-settings')).toBeTruthy();
    expect(screen.getByTestId('open-reports')).toBeTruthy();
    expect(screen.getByTestId('owner-box')).toBeTruthy();
    expect(screen.getByTestId('open-management')).toBeTruthy();
    await saveAppearance('dark');
    expect(await loadAppearance()).toBe('dark');
    await saveAppearance('phone');
    expect(await loadAppearance()).toBe('phone');
  });

  test('Management opens on People and has Setup and Odoo parts', async () => {
    const { odoo } = bakery();
    await open(odoo, '/management', 'owner');
    expect(screen.getByTestId('reload-people')).toBeTruthy();
    expect(screen.queryByTestId('alerts-card')).toBeNull();
    await fireEvent.press(screen.getByTestId('mgmt-part-setup'));
    expect(screen.getByTestId('alerts-card')).toBeTruthy();
    expect(screen.getByTestId('brand-card')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('mgmt-part-odoo'));
    expect(screen.getByTestId('open-developer')).toBeTruthy();
  });

  test('Settings has the Light, Dark or Phone choice', async () => {
    const { odoo } = bakery();
    await open(odoo, '/settings', 'owner');
    await fireEvent.press(screen.getByTestId('look-seg-light'));
    await settle();
    expect(await loadAppearance()).toBe('light');
  });

  test('the Online shop and Money menus still open their pages with the new card rows', async () => {
    const { odoo } = bakery();
    await open(odoo, '/shop', 'owner');
    expect(screen.getByTestId('shop-carriers')).toBeTruthy();
    expect(screen.queryByTestId('shop-news')).toBeNull();
    expect(screen.queryByTestId('shop-closed')).toBeNull();
    expect(screen.queryByTestId('shop-list')).toBeNull();
    expect(screen.queryByTestId('shop-orders')).toBeNull();
    await fireEvent.press(screen.getByTestId('shop-specials'));
    await settle();
    expect(screen.getByTestId('specials-page')).toBeTruthy();
  });

  test('the Money menu lists its reports as rows', async () => {
    const { odoo } = bakery();
    await open(odoo, '/reports', 'owner');
    expect(screen.getByTestId('rep-sales')).toBeTruthy();
    expect(screen.getByTestId('rep-packet')).toBeTruthy();
  });
});
