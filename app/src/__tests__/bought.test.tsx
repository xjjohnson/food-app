import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { boughtChanges, loadChoices, loadJournals, lastPricePaid } from '../lib/ingredients';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

function shop(odoo: FakeOdoo) {
  const cat = odoo.create('product.category', { name: 'Raw Material' });
  const flour = odoo.create('product.product', { name: 'Flour', display_name: 'Flour', tracking: 'lot', categ_id: [cat, 'Raw Material'], uom_id: [1, 'kg'] });
  const sugar = odoo.create('product.product', { name: 'Sugar', display_name: 'Sugar', tracking: 'none', categ_id: [cat, 'Raw Material'], uom_id: [1, 'kg'] });
  const store = odoo.create('res.partner', { name: 'Costco' });
  const cash = odoo.create('account.journal', { name: 'Cash', type: 'cash' });
  odoo.create('account.journal', { name: 'Sales', type: 'sale' });
  return { flour, sugar, store, cash };
}

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const supplier = { id: 0, name: 'Costco' };

describe('bought ingredients: one chain for a shopping trip', () => {
  test('makes the order, receives it with the price paid, and marks the bill paid, even from the offline queue', async () => {
    const { odoo } = bakery();
    const s = shop(odoo);
    const c = await client(odoo);
    expect((await loadJournals(c)).map((j) => j.name)).toEqual(['Cash']);
    expect((await loadChoices(c, '', false)).find((x) => x.name === 'Flour')).toMatchObject({ tracked: true, unit: 'kg' });
    const changes = boughtChanges({ ...supplier, id: s.store }, [
      { productId: s.flour, name: 'Flour', qty: 10, price: 1.8, lot: 'F-1', useBy: '2027-05-01' },
      { productId: s.sugar, name: 'Sugar', qty: 5, price: 0.9, lot: '', useBy: '' },
    ], { billing: true, journalId: s.cash, date: '2026-11-25' });
    expect(changes.map((x) => x.label)).toEqual([expect.stringMatching(/^Bought from/), expect.stringMatching(/^Receive purchase/), expect.stringMatching(/^Paid bill/)]);
    // No signal at the shop: all three wait, in order.
    odoo.offline = true;
    for (const ch of changes) expect((await saveOrQueue(c, AsyncStorage, DB, 1, ch)).status).toBe('queued');
    expect(await loadQueue(AsyncStorage)).toHaveLength(3);
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(3);
    // The order carries the price paid; the delivery is received with the batch.
    expect(odoo.tables['purchase.order.line']!.map((l) => l.price_unit)).toEqual([1.8, 0.9]);
    expect(odoo.tables['stock.picking']![0]!.state).toBe('done');
    expect(odoo.tables['stock.move.line']![0]).toMatchObject({ lot_name: 'F-1', expiration_date: '2027-05-01 12:00:00', quantity: 10 });
    // The bill is posted, dated, and paid from the chosen way to pay.
    expect(odoo.tables['account.move']![0]).toMatchObject({ state: 'posted', invoice_date: '2026-11-25', payment_state: 'paid' });
    expect(odoo.tables['account.payment']![0]).toMatchObject({ journal_id: [s.cash, expect.any(String)] });
    // The last price paid is there to start from next time.
    expect(await lastPricePaid(c, s.flour)).toBe(1.8);
  });

  test('a retry after the first send got there does not order, receive or pay twice', async () => {
    const { odoo } = bakery();
    const s = shop(odoo);
    const c = await client(odoo);
    const changes = boughtChanges({ ...supplier, id: s.store }, [{ productId: s.sugar, name: 'Sugar', qty: 5, price: 0.9, lot: '', useBy: '' }], { billing: true, journalId: s.cash, date: '2026-11-25' });
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    // The phone never heard back, so it sends the same three again.
    await AsyncStorage.clear();
    odoo.offline = true;
    for (const ch of changes) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(3);
    expect(odoo.tables['purchase.order']).toHaveLength(1);
    expect(odoo.tables['account.move']).toHaveLength(1);
    expect(odoo.tables['account.payment']).toHaveLength(1);
  });

  test('not paid yet leaves the bill open, and no Accounting app stops after receiving', async () => {
    const { odoo } = bakery();
    const s = shop(odoo);
    const c = await client(odoo);
    const open = boughtChanges({ ...supplier, id: s.store }, [{ productId: s.sugar, name: 'Sugar', qty: 5, price: 0.9, lot: '', useBy: '' }], { billing: true, journalId: null, date: '2026-11-25' });
    for (const ch of open) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(odoo.tables['account.move']![0]).toMatchObject({ state: 'posted', payment_state: 'not_paid' });
    expect(odoo.tables['account.payment'] ?? []).toHaveLength(0);
    const noBill = boughtChanges({ ...supplier, id: s.store }, [{ productId: s.sugar, name: 'Sugar', qty: 1, price: 1, lot: '', useBy: '' }], { billing: false, journalId: null, date: '2026-11-25' });
    expect(noBill).toHaveLength(2);
  });
});

describe('bought ingredients screen', () => {
  test('price each and total follow each other, and one Save does it all', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const s = shop(odoo);
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
    await fireEvent.press(screen.getByTestId('ing-bought'));
    await settle();
    await fireEvent.press(screen.getByTestId('bought-pick-supplier'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`bought-supplier-${s.store}`));
    await settle();
    await fireEvent.press(screen.getByTestId('bought-add'));
    await settle();
    await fireEvent.press(await screen.findByTestId(`bought-pick-${s.sugar}`));
    await fireEvent.press(screen.getByTestId('bought-add-picked'));
    await settle();
    // A compact receipt row; tap it to edit.
    const row = screen.getByTestId(/^bought-line-/);
    const line = row.props.testID.replace('bought-line-', '');
    await fireEvent.press(row);
    await settle();
    await fireEvent.changeText(screen.getByTestId(`bought-qty-${line}`), '5');
    await fireEvent.changeText(screen.getByTestId(`bought-total-${line}`), '4.5');
    expect(screen.getByTestId(`bought-price-${line}`).props.value).toBe('0.9');
    // Tap the row again to fold it.
    await fireEvent.press(row);
    await settle();
    expect(screen.getByTestId('bought-running-total')).toHaveTextContent(/4\.5/);
    await fireEvent.press(screen.getByTestId('bought-next'));
    await settle();
    expect(screen.getByTestId('bought-total')).toHaveTextContent(/4\.5/);
    await fireEvent.press(await screen.findByTestId(`bought-pay-${s.cash}`));
    await fireEvent.press(screen.getByTestId('bought-save'));
    await settle();
    expect(odoo.tables['purchase.order.line']![0]).toMatchObject({ product_qty: 5, price_unit: 0.9 });
    expect(odoo.tables['stock.picking']![0]!.state).toBe('done');
    expect(odoo.tables['account.move']![0]).toMatchObject({ payment_state: 'paid' });
  });
});
