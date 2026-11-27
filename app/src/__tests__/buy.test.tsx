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

async function open(odoo: FakeOdoo, role: string) {
  await AsyncStorage.clear();
  odoo.addEmployee('Tester', odoo.addUser({ login: 'role@example.com' }).id, [role]);
  globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
  const login = { url: URL, db: 'food-test', login: 'role@example.com' };
  await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
  await deviceSecrets().set('odoo.secret', 'key');
  await setDbKind(AsyncStorage, login, 'test');
  await renderRouter('src/app', { initialUrl: '/' });
  await settle();
  await fireEvent.press(screen.getByTestId('tab-buy'));
  await settle();
}

describe('the Buy tab', () => {
  test('shows the short card list and no purchase orders or delivery check-in', async () => {
    const { odoo } = bakery();
    await open(odoo, 'Inventory');
    for (const id of ['buy-bought', 'buy-low', 'buy-shop', 'buy-list', 'buy-suppliers', 'buy-history']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.queryByTestId('buy-pos')).toBeNull();
    expect(screen.queryByTestId('buy-receipts')).toBeNull();
    expect(screen.queryByText('Purchase orders')).toBeNull();
    expect(screen.queryByText('Check in a delivery')).toBeNull();
  });
});
