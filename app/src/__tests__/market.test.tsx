import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import { setDbKind } from '../lib/dbSwitch';
import { loadMarket, posUrl } from '../lib/market';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { deviceSecrets } from '../lib/secrets';
import { bakery, URL } from '../testing/fakeOdoo';

describe('market', () => {
  test('reads registers and payment methods, and builds the selling-screen address', async () => {
    const { odoo } = bakery();
    odoo.create('pos.config', { name: 'Farmers market' });
    for (const n of ['Cash', 'Cash App', 'Venmo']) odoo.create('pos.payment.method', { name: n });
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    const info = await loadMarket(c);
    expect(info.registers.map((r) => r.name)).toEqual(['Farmers market']);
    expect(info.payments.sort()).toEqual(['Cash', 'Cash App', 'Venmo']);
    expect(posUrl('https://x.example.com/', 3)).toBe('https://x.example.com/pos/ui?config_id=3');
    // Reading only: nothing was written.
    expect(odoo.calls.every((x) => x.method === 'search_read' || x.model === 'res.users' || x.model === 'ir.model' || x.method === 'read')).toBe(true);
  });

  test('a seller opens the register from the Market screen', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const reg = odoo.create('pos.config', { name: 'Farmers market' });
    odoo.addEmployee('Sam Seller', odoo.addUser({ login: 'sell@example.com' }).id, ['Sales']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'sell@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/market' });
    await settle();
    await fireEvent.press(screen.getByTestId(`open-pos-${reg}`));
    expect(open).toHaveBeenCalledWith(`${URL}/pos/ui?config_id=${reg}`);
    // Before has the get-ready jobs; After has the close-up jobs.
    expect(screen.getByTestId('market-take')).toBeTruthy();
    expect(screen.queryByTestId('market-checkin')).toBeNull();
    await fireEvent.press(screen.getByTestId('market-part-after'));
    expect(screen.getByTestId('market-checkin')).toBeTruthy();
    expect(screen.getByTestId('market-results')).toBeTruthy();
    expect(screen.queryByTestId('market-take')).toBeNull();
  });
});
