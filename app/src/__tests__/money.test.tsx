import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { deviceSecrets } from '../lib/secrets';
import { filterMoney, loadMoney, loadMoneyLines, payChange, stateWords } from '../lib/money';
import { AREAS } from '../lib/areas';
import { canSee } from '../lib/roles';
import { newIngredientChange } from '../lib/ingredientList';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

function books(odoo: FakeOdoo) {
  const anna = odoo.create('res.partner', { name: 'Anna Baker' });
  const costco = odoo.create('res.partner', { name: 'Costco' });
  const cash = odoo.create('account.journal', { name: 'Cash', type: 'cash' });
  const jam = odoo.create('product.product', { name: 'Apricot Jam', display_name: 'Apricot Jam' });
  const owed = odoo.create('account.move', { name: 'INV/2026/0007', move_type: 'out_invoice', state: 'posted', payment_state: 'not_paid', partner_id: [anna, 'Anna Baker'], invoice_date: '2026-11-20', invoice_date_due: '2026-12-05', amount_total: 24, amount_residual: 24, invoice_origin: 'S0042' });
  const paid = odoo.create('account.move', { name: 'INV/2026/0006', move_type: 'out_invoice', state: 'posted', payment_state: 'paid', partner_id: [anna, 'Anna Baker'], invoice_date: '2026-11-10', amount_total: 16, amount_residual: 0 });
  const bill = odoo.create('account.move', { name: 'BILL/2026/0003', move_type: 'in_invoice', state: 'posted', payment_state: 'not_paid', partner_id: [costco, 'Costco'], invoice_date: '2026-11-22', amount_total: 55.5, amount_residual: 55.5 });
  odoo.create('account.move', { name: 'INV/2026/0005', move_type: 'out_invoice', state: 'cancel', payment_state: 'not_paid', partner_id: [anna, 'Anna Baker'], invoice_date: '2026-11-01', amount_total: 9, amount_residual: 9 });
  odoo.create('account.move.line', { move_id: owed, display_type: 'product', name: 'Apricot Jam', product_id: [jam, 'Apricot Jam'], quantity: 3, price_unit: 8, price_subtotal: 24 });
  odoo.create('account.move.line', { move_id: owed, display_type: 'line_section', name: 'Delivery', quantity: 0, price_unit: 0, price_subtotal: 0 });
  return { owed, paid, bill, cash };
}

describe('money list: invoices and purchase history', () => {
  test('reads invoices and bills separately, newest first, cancelled left out, with Odoo’s own numbers', async () => {
    const { odoo } = bakery();
    books(odoo);
    const c = await client(odoo);
    const inv = await loadMoney(c, 'out');
    expect(inv.map((r) => r.name)).toEqual(['INV/2026/0007', 'INV/2026/0006']);
    expect(inv[0]).toMatchObject({ who: 'Anna Baker', total: 24, left: 24, paid: false, due: '2026-12-05', origin: 'S0042' });
    expect((await loadMoney(c, 'in')).map((r) => r.name)).toEqual(['BILL/2026/0003']);
    expect((await loadMoneyLines(c, inv[0]!.id)).map((l) => ({ name: l.name, qty: l.qty, price: l.price, subtotal: l.subtotal }))).toEqual([{ name: 'Apricot Jam', qty: 3, price: 8, subtotal: 24 }]);
  });

  test('Not paid, Paid and All, and search by customer or number', async () => {
    const { odoo } = bakery();
    books(odoo);
    const rows = await loadMoney(await client(odoo), 'out');
    expect(filterMoney(rows, 'owed', '').map((r) => r.name)).toEqual(['INV/2026/0007']);
    expect(filterMoney(rows, 'paid', '').map((r) => r.name)).toEqual(['INV/2026/0006']);
    expect(filterMoney(rows, 'all', 'anna')).toHaveLength(2);
    expect(filterMoney(rows, 'all', '0006')).toHaveLength(1);
    expect(filterMoney(rows, 'all', 'zzz')).toHaveLength(0);
    expect(rows.map(stateWords)).toEqual(['Not paid', 'Paid']);
  });

  test('mark paid works with no signal, goes once when signal returns, and a second send does not pay twice', async () => {
    const { odoo } = bakery();
    const b = books(odoo);
    const c = await client(odoo);
    const [row] = await loadMoney(c, 'out');
    const ch = payChange(row!, b.cash, 'Cash', '2026-11-25');
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, ch)).status).toBe('queued');
    expect(await loadQueue(AsyncStorage)).toHaveLength(1);
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(1);
    expect(odoo.tables['account.move']!.find((m) => m.id === b.owed)).toMatchObject({ payment_state: 'paid' });
    expect(odoo.tables['account.payment']).toHaveLength(1);
    // Paying it again (a retry, or someone paid it in Odoo meanwhile) changes nothing.
    await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(odoo.tables['account.payment']).toHaveLength(1);
  });

  test('a draft invoice is not paid; Odoo’s reason is shown, nothing is made', async () => {
    const { odoo } = bakery();
    const b = books(odoo);
    odoo.tables['account.move']!.find((m) => m.id === b.owed)!.state = 'draft';
    const c = await client(odoo);
    const [row] = await loadMoney(c, 'out');
    expect(stateWords(row!)).toBe('Draft');
    await expect(saveOrQueue(c, AsyncStorage, DB, 1, payChange(row!, b.cash, 'Cash', '2026-11-25'))).rejects.toThrow(/not confirmed/);
    expect(odoo.tables['account.payment'] ?? []).toHaveLength(0);
  });
});

describe('who sees what', () => {
  test('Invoices is for Sales and the Owner, not Production', () => {
    const a = AREAS.find((x) => x.id === 'invoices')!;
    expect(a.role).toBe('sales');
    const none = { owner: false, production: false, inventory: false, sales: false, shipping: false };
    expect(canSee({ ...none, sales: true }, a.role)).toBe(true);
    expect(canSee({ ...none, owner: true }, a.role)).toBe(true);
    expect(canSee({ ...none, production: true }, a.role)).toBe(false);
  });
});

describe('F26: new ingredients count stock', () => {
  test('an ingredient added in the app is made with Track Inventory on', () => {
    const ch = newIngredientChange({ name: 'Butter', categoryId: 1, cost: 3, taxIds: [], reference: '', barcode: '' }, null);
    expect(ch.args[0]).toMatchObject({ name: 'Butter', purchase_ok: true, sale_ok: false, is_storable: true });
  });
});

describe('screens', () => {
  test('a salesperson opens Invoices, sees who owes, opens one and marks it paid', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const b = books(odoo);
    odoo.addEmployee('Sam Sales', odoo.addUser({ login: 'sales@example.com' }).id, ['Sales']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'sales@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/invoices' });
    await settle();
    expect(await screen.findByTestId(`money-${b.owed}`)).toBeTruthy();
    expect(screen.queryByTestId(`money-${b.paid}`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`money-${b.owed}`));
    await settle();
    expect(await screen.findByText('Apricot Jam')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId(`pay-${b.cash}`));
    await settle();
    expect(odoo.tables['account.move']!.find((m) => m.id === b.owed)).toMatchObject({ payment_state: 'paid' });
  });
});
