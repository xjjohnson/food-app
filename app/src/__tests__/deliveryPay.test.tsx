import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { payMethods, salePayChange } from '../lib/deliveryPay';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { saveOrQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

describe('pay on delivery', () => {
  test('separate buttons when Odoo has them, one combined button when Cash App and Venmo share a journal', () => {
    const all = [
      { id: 1, name: 'Cash' },
      { id: 2, name: 'Cash App' },
      { id: 3, name: 'Venmo' },
      { id: 4, name: 'Bank' },
    ];
    expect(payMethods(all).map((m) => m.label)).toEqual(['Cash', 'Cash App', 'Venmo']);
    expect(payMethods([{ id: 1, name: 'Cash' }, { id: 2, name: 'Cash App / Venmo' }]).map((m) => m.label)).toEqual(['Cash', 'Cash App / Venmo']);
    expect(payMethods([{ id: 4, name: 'Bank' }])).toEqual([]);
  });

  test('the invoice is made once and posted; the payment is recorded and never doubled', async () => {
    const { odoo } = bakery();
    const sale = odoo.create('sale.order', { name: 'S0050', state: 'sale', partner_id: [5, 'Anna'], amount_total: 12 });
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    const day = '2026-11-26';
    await saveOrQueue(c, AsyncStorage, DB, 1, salePayChange(sale, 'S0050', null, '', day));
    expect(odoo.tables['account.move']).toHaveLength(1);
    expect(odoo.tables['account.move']![0]!.state).toBe('posted');
    expect(odoo.tables['account.move']![0]!.payment_state).toBe('not_paid');
    await saveOrQueue(c, AsyncStorage, DB, 1, salePayChange(sale, 'S0050', 9, 'Cash', day));
    await saveOrQueue(c, AsyncStorage, DB, 1, salePayChange(sale, 'S0050', 9, 'Cash', day));
    expect(odoo.tables['account.move']).toHaveLength(1);
    expect(odoo.tables['account.move']![0]!.payment_state).toBe('paid');
    expect(odoo.tables['account.payment']).toHaveLength(1);
  });

  test('on the board, Delivered makes the invoice and Cash marks it paid', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const today = new Date().toISOString().slice(0, 10);
    const sale = odoo.create('sale.order', { name: 'S0051', state: 'sale', partner_id: [5, 'Anna Baker'], amount_total: 20 });
    const p = odoo.create('stock.picking', { name: 'WH/OUT/3', picking_type_code: 'outgoing', state: 'done', origin: 'S0051', partner_id: [5, 'Anna Baker'], scheduled_date: `${today} 07:00:00`, date_done: `${today} 09:00:00`, sale_id: [sale, 'S0051'] });
    const cash = odoo.create('account.journal', { name: 'Cash', type: 'cash' });
    odoo.create('account.journal', { name: 'Venmo', type: 'bank' });
    odoo.addEmployee('Sid Shipper', odoo.addUser({ login: 'ship@example.com' }).id, ['Shipping and packaging']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'ship@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/orders' });
    await settle();
    await fireEvent.press(await screen.findByTestId('open-board'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`board-delivered-${p}`));
    await settle();
    expect(odoo.tables['account.move']).toHaveLength(1);
    expect(odoo.tables['account.move']![0]!.payment_state).toBe('not_paid');
    await fireEvent.press(await screen.findByTestId(`pay-${p}-cash`));
    await settle();
    expect(screen.getByText(/Paid with Cash/)).toBeTruthy();
    expect(odoo.tables['account.move']![0]!.payment_state).toBe('paid');
    expect((odoo.tables['account.payment']![0]!.journal_id as [number, string])[0]).toBe(cash);
  });
});
