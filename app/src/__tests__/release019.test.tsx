import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { areasForRoles, AREAS } from '../lib/areas';
import { setDbKind } from '../lib/dbSwitch';
import { deliveredChange, loadBoard, mapLink } from '../lib/deliveryBoard';
import { loadMoney } from '../lib/money';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadPriceHistory } from '../lib/priceHistory';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { searchAll } from '../lib/searchAll';
import { loadToday } from '../lib/today';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';
const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
const ALL = { owner: true, production: false, inventory: false, sales: false, shipping: false };

describe('price history', () => {
  test('lists what was paid for an ingredient, newest first, with the cheapest marked', async () => {
    const { odoo } = bakery();
    const tmpl = odoo.create('product.template', { name: 'Sugar' });
    const prod = odoo.create('product.product', { name: 'Sugar', product_tmpl_id: tmpl });
    const other = odoo.create('product.product', { name: 'Flour', product_tmpl_id: 999 });
    const line = (date: string, price: number, product: number, store: string) =>
      odoo.create('account.move.line', { product_id: [product, 'x'], move_type: 'in_invoice', parent_state: 'posted', display_type: 'product', date, partner_id: [1, store], price_unit: price, quantity: 5, move_name: 'BILL/1' });
    line('2026-10-01', 0.9, prod, 'Costco');
    line('2026-11-01', 1.1, prod, 'HEB');
    line('2026-11-05', 3, other, 'HEB');
    const h = await loadPriceHistory(await client(odoo), tmpl);
    expect(h.map((p) => [p.price, p.store, p.cheapest]).sort()).toEqual([[0.9, 'Costco', true], [1.1, 'HEB', false]]);
  });
});

describe('delivery board', () => {
  function setup(odoo: FakeOdoo) {
    const anna = odoo.create('res.partner', { name: 'Anna Baker', phone: '555-0100', street: '12 Oak St', city: 'Austin', zip: '78701', comment: 'Leave on the porch' });
    const sale = odoo.create('sale.order', { name: 'S0042', partner_id: [anna, 'Anna Baker'] });
    const today = new Date().toISOString().slice(0, 10);
    const toPack = odoo.create('stock.picking', { name: 'WH/OUT/1', picking_type_code: 'outgoing', state: 'assigned', origin: 'S0099', partner_id: [anna, 'Anna Baker'], scheduled_date: `${today} 08:00:00`, sale_id: false });
    const packed = odoo.create('stock.picking', { name: 'WH/OUT/2', picking_type_code: 'outgoing', state: 'done', origin: 'S0042', partner_id: [anna, 'Anna Baker'], scheduled_date: `${today} 07:00:00`, date_done: `${today} 09:00:00`, sale_id: [sale, 'S0042'] });
    return { sale, toPack, packed };
  }

  test('shows the steps, address, phone and notes, and Delivered is saved once, even from the offline queue', async () => {
    const { odoo } = bakery();
    const s = setup(odoo);
    const c = await client(odoo);
    const board = await loadBoard(c);
    expect(board.map((o) => [o.name, o.step])).toEqual([['WH/OUT/2', 'packed'], ['WH/OUT/1', 'pack']]);
    expect(board[0]).toMatchObject({ phone: '555-0100', address: '12 Oak St, Austin, 78701', notes: 'Leave on the porch', saleId: s.sale });
    expect(mapLink(board[0]!.address)).toContain('12%20Oak%20St');
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, deliveredChange(board[0]!))).status).toBe('queued');
    odoo.offline = false;
    expect((await sendQueue(c, AsyncStorage, DB)).sent).toBe(1);
    expect((await loadBoard(c)).find((o) => o.name === 'WH/OUT/2')!.step).toBe('delivered');
    // Tapping again (or a retry) does not post a second note.
    await saveOrQueue(c, AsyncStorage, DB, 1, deliveredChange(board[0]!));
    expect(odoo.tables['mail.message']!.filter((m) => m.model === 'sale.order')).toHaveLength(1);
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
  });
});

describe('customer history, search, Today and home order', () => {
  test('one customer’s invoices only', async () => {
    const { odoo } = bakery();
    const mk = (name: string, p: number) => odoo.create('account.move', { name, move_type: 'out_invoice', state: 'posted', payment_state: 'not_paid', partner_id: [p, 'x'], invoice_date: '2026-11-01', amount_total: 5, amount_residual: 5 });
    mk('INV/1', 7);
    mk('INV/2', 8);
    expect((await loadMoney(await client(odoo), 'out', { partnerId: 7 })).map((r) => r.name)).toEqual(['INV/1']);
  });

  test('search finds products, contacts, batch numbers and orders in one go', async () => {
    const { odoo } = bakery();
    odoo.create('product.template', { name: 'Apricot Jam' });
    odoo.create('res.partner', { name: 'Apricot Cafe', phone: '', email: '' });
    odoo.create('stock.lot', { name: 'APR-001', product_id: [1, 'Apricot Jam'] });
    const hits = await searchAll(await client(odoo), 'apr');
    expect(hits.map((h) => h.kind).sort()).toEqual(['Batch number', 'Contact', 'Product']);
    expect(await searchAll(await client(odoo), 'a')).toEqual([]);
  });

  test('Today counts unpaid invoices for sales and the owner', async () => {
    const { odoo } = bakery();
    odoo.create('account.move', { move_type: 'out_invoice', state: 'posted', payment_state: 'not_paid' });
    odoo.create('account.move', { move_type: 'out_invoice', state: 'posted', payment_state: 'paid' });
    const t = await loadToday(await client(odoo), ALL);
    expect(t.find((x) => x.id === 'owed')).toMatchObject({ count: 1, area: 'invoices' });
  });

  test('a production person sees batches before everything else', () => {
    const mine = areasForRoles(AREAS, { owner: false, production: true, inventory: false, sales: true, shipping: false });
    expect(mine.slice(0, 3).map((a) => a.id)).toEqual(['production', 'invoices', 'safety']);
    expect(areasForRoles(AREAS, ALL).map((a) => a.id)).toEqual(AREAS.map((a) => a.id));
  });
});

describe('screens', () => {
  test('the delivery board opens from Website orders and ticks Delivered', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const today = new Date().toISOString().slice(0, 10);
    const sale = odoo.create('sale.order', { name: 'S0042' });
    const p = odoo.create('stock.picking', { name: 'WH/OUT/2', picking_type_code: 'outgoing', state: 'done', origin: 'S0042', partner_id: [5, 'Anna Baker'], scheduled_date: `${today} 07:00:00`, date_done: `${today} 09:00:00`, sale_id: [sale, 'S0042'] });
    odoo.addEmployee('Sid Shipper', odoo.addUser({ login: 'ship@example.com' }).id, ['Shipping and packaging']);
    globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
    const login = { url: URL, db: 'food-test', login: 'ship@example.com' };
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await deviceSecrets().set('odoo.secret', 'key');
    await setDbKind(AsyncStorage, login, 'test');
    const settle = async () => {
      for (let i = 0; i < 30; i++) await act(async () => undefined);
    };
    await renderRouter('src/app', { initialUrl: '/area/orders?go=board' });
    await settle();
    await fireEvent.press(await screen.findByText(/Ready \(1\)/));
    await fireEvent.press(await screen.findByTestId(`board-delivered-${p}`));
    await settle();
    expect(odoo.tables['mail.message']!.filter((m) => m.model === 'sale.order')).toHaveLength(1);
  });
});
