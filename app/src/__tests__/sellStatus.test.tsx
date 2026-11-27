import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { planMakeChange } from '../lib/orders';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { deviceSecrets } from '../lib/secrets';
import { loadCustomerStatus, loadOrderStatus } from '../lib/sellStatus';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
};
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function seed(odoo: FakeOdoo) {
  const mk = (name: string, state: string, when: string) => {
    const sale = odoo.create('sale.order', { name, state: 'sale' });
    return odoo.create('stock.picking', { name: `WH/${name}`, origin: name, partner_id: [7, 'Pat'], state, picking_type_code: 'outgoing', sale_id: [sale, name], scheduled_date: `${when} 08:00:00`, date_done: `${when} 09:00:00` });
  };
  mk('S1', 'assigned', '2026-11-27');
  mk('S2', 'assigned', '2026-11-26');
  mk('S3', 'done', '2026-11-27');
}

describe('Sell status buttons', () => {
  test('order counts come from the delivery board: packed, to pack, late', async () => {
    const { odoo } = bakery();
    seed(odoo);
    const s = await loadOrderStatus(await client(odoo), new Date('2026-11-27T12:00:00Z'));
    expect(s).toEqual({ packed: 1, toPack: 2, needs: 0, late: 1 });
  });

  test('customer counts read customers and unpaid invoices', async () => {
    const { odoo } = bakery();
    odoo.create('res.partner', { name: 'Pat', customer_rank: 1 });
    odoo.create('account.move', { move_type: 'out_invoice', state: 'posted', payment_state: 'not_paid', invoice_date_due: '2026-11-20' });
    odoo.create('account.move', { move_type: 'out_invoice', state: 'posted', payment_state: 'paid', invoice_date_due: '2026-11-20' });
    const s = await loadCustomerStatus(await client(odoo), new Date('2026-11-27T12:00:00Z'));
    expect(s.owe).toBe(1);
    expect(s.overdue).toBe(1);
  });

  test('the Sell tab shows the colored buttons and its cards', async () => {
    const { odoo } = bakery();
    odoo.addEmployee('Tester', odoo.addUser({ login: 'role@example.com' }).id, ['owner']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'role@example.com' };
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    await fireEvent.press(screen.getByTestId('tab-sell'));
    await settle();
    expect(screen.getByTestId('status-topack')).toBeTruthy();
    expect(screen.getByTestId('board-inline')).toBeTruthy();
    expect(screen.queryByTestId('sell-wholesale-tab')).toBeNull();
    expect(screen.queryByTestId('sell-repeat-tab')).toBeNull();
    expect(screen.queryByTestId('sell-seg-customers')).toBeNull();
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    expect(screen.getByTestId('open-contacts')).toBeTruthy();
  });

  test('Packed opens the board on Ready and To pack on To pack', async () => {
    const { odoo } = bakery();
    seed(odoo);
    odoo.addEmployee('Tester', odoo.addUser({ login: 'role@example.com' }).id, ['owner']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'role@example.com' };
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    await fireEvent.press(screen.getByTestId('tab-sell'));
    await settle();
    await fireEvent.press(screen.getByTestId('status-packed'));
    await settle();
    expect(screen.getByTestId('board-stages-packed').props.accessibilityState.selected).toBe(true);
  });
});

describe('Orders that need product', () => {
  test('a waiting order, or a stocked line with too little on hand, is not To pack', async () => {
    const { odoo } = bakery();
    const mk = (name: string, state: string) => {
      const sale = odoo.create('sale.order', { name, state: 'sale' });
      return odoo.create('stock.picking', { name: `WH/${name}`, origin: name, partner_id: [7, 'Pat'], state, picking_type_code: 'outgoing', sale_id: [sale, name], scheduled_date: '2026-11-27 08:00:00' });
    };
    mk('S1', 'assigned');
    mk('S2', 'confirmed');
    const p3 = mk('S3', 'assigned');
    const sauce = odoo.create('product.product', { name: 'Sweet Pineapple Chili Sauce', is_storable: true, qty_available: 0, free_qty: 0 });
    odoo.create('stock.move', { picking_id: p3, product_id: [sauce, 'Sweet Pineapple Chili Sauce'], product_uom_qty: 2, state: 'assigned' });
    const s = await loadOrderStatus(await client(odoo), new Date('2026-11-27T12:00:00Z'));
    expect(s.toPack).toBe(1);
    expect(s.needs).toBe(2);
  });
});

describe('Add what is short to the plan', () => {
  test('makes a draft batch from the product recipe, or nothing without one', async () => {
    const { odoo } = bakery();
    odoo.create('mrp.bom', { product_tmpl_id: [1, 'Sauce'], product_id: [5, 'Sauce'], product_qty: 1, type: 'normal', bom_line_ids: [] });
    const c = await client(odoo);
    const change = await planMakeChange(c, 5, 3);
    expect(change?.model).toBe('mrp.production');
    expect(change?.label).toContain('3');
    expect(await planMakeChange(c, 99, 3)).toBeNull();
  });
});
