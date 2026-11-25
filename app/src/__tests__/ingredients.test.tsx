import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { checkInChanges, loadReceiptLines, loadReceipts, loadRules, placeOrderChange, searchSuppliers, setLevelsChange, usualSuppliers } from '../lib/ingredients';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadQueue, saveOrQueue, sendQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

const DB = 'https://test.food.example.com|food-test';

/** Flour is low (2 left, low at 5, full at 20); sugar is fine. Mill & Co. is flour's usual supplier. A flour delivery is due. */
function pantry(odoo: FakeOdoo) {
  const flour = odoo.create('product.product', { name: 'Flour', product_tmpl_id: [11, 'Flour'], tracking: 'lot' });
  const sugar = odoo.create('product.product', { name: 'Sugar', product_tmpl_id: [12, 'Sugar'], tracking: 'none' });
  const rule = odoo.create('stock.warehouse.orderpoint', { product_id: [flour, 'Flour'], product_min_qty: 5, product_max_qty: 20, qty_on_hand: 2, qty_forecast: 2, qty_to_order: 0, product_uom_name: 'kg' });
  odoo.create('stock.warehouse.orderpoint', { product_id: [sugar, 'Sugar'], product_min_qty: 5, product_max_qty: 20, qty_on_hand: 15, qty_forecast: 15, qty_to_order: 0, product_uom_name: 'kg' });
  const mill = odoo.create('res.partner', { name: 'Mill & Co.' });
  odoo.create('product.supplierinfo', { product_tmpl_id: [11, 'Flour'], partner_id: [mill, 'Mill & Co.'] });
  const pick = odoo.create('stock.picking', { name: 'WH/IN/00001', origin: 'P00001', partner_id: [mill, 'Mill & Co.'], picking_type_code: 'incoming', state: 'assigned' });
  const move = odoo.create('stock.move', { picking_id: pick, product_id: [flour, 'Flour'], product_uom_qty: 18, location_id: [4, 'Vendors'], location_dest_id: [8, 'Stock'], move_line_ids: [] });
  return { flour, sugar, rule, mill, pick, move };
}

const client = (odoo: FakeOdoo) => OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');

describe('ingredients lib', () => {
  test('only what is under its level shows as low, with an amount to order up to full', async () => {
    const { odoo } = bakery();
    const s = pantry(odoo);
    const c = await client(odoo);
    const low = await loadRules(c, true);
    expect(low.map((l) => [l.name, l.onHand, l.suggest])).toEqual([['Flour', 2, 18]]);
    expect(await loadRules(c, false)).toHaveLength(2);
    expect((await usualSuppliers(c, s.flour)).map((x) => x.name)).toEqual(['Mill & Co.']);
    expect((await searchSuppliers(c, 'mill'))[0]!.name).toBe('Mill & Co.');
  });

  test('changing levels edits the rule; a product with none gets a new one, once', async () => {
    const { odoo } = bakery();
    const s = pantry(odoo);
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, setLevelsChange('Flour', s.flour, 8, 30, s.rule));
    expect(odoo.tables['stock.warehouse.orderpoint']!.find((r) => r.id === s.rule)).toMatchObject({ product_min_qty: 8, product_max_qty: 30 });
    const salt = odoo.create('product.product', { name: 'Salt' });
    const ch = setLevelsChange('Salt', salt, 1, 4, null);
    await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    odoo.offline = true;
    await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['stock.warehouse.orderpoint']!.filter((r) => String(r.product_id) === `${salt},Product` || (r.product_id as number[])[0] === salt || r.product_id === salt)).toHaveLength(1);
  });

  test('placing an order makes a purchase order for the supplier and confirms it; prices are left to Odoo', async () => {
    const { odoo } = bakery();
    const s = pantry(odoo);
    const c = await client(odoo);
    await saveOrQueue(c, AsyncStorage, DB, 1, placeOrderChange({ id: s.mill, name: 'Mill & Co.' }, [{ productId: s.flour, name: 'Flour', qty: 18 }]));
    const po = odoo.tables['purchase.order']![0]!;
    expect(po).toMatchObject({ partner_id: s.mill, state: 'purchase' });
    const lines = odoo.tables['purchase.order.line']!.filter((l) => l.order_id === po.id);
    expect(lines.map((l) => l.product_qty)).toEqual([18]);
    expect(JSON.stringify(lines)).not.toMatch(/price/);
  });

  test('an order made without signal is sent once', async () => {
    const { odoo } = bakery();
    const s = pantry(odoo);
    const c = await client(odoo);
    odoo.offline = true;
    expect((await saveOrQueue(c, AsyncStorage, DB, 1, placeOrderChange({ id: s.mill, name: 'Mill' }, [{ productId: s.flour, name: 'Flour', qty: 5 }]))).status).toBe('queued');
    odoo.offline = false;
    await sendQueue(c, AsyncStorage, DB);
    await sendQueue(c, AsyncStorage, DB);
    expect(odoo.tables['purchase.order']).toHaveLength(1);
    expect(odoo.tables['purchase.order']![0]!.state).toBe('purchase');
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
  });

  test('checking a delivery in records the supplier’s batch and use-by date, then validates', async () => {
    const { odoo } = bakery();
    const s = pantry(odoo);
    const c = await client(odoo);
    const [rec] = await loadReceipts(c);
    const [line] = await loadReceiptLines(c, rec!.id);
    expect(line).toMatchObject({ name: 'Flour', ordered: 18, tracked: true });
    for (const ch of checkInChanges(rec!, [{ line: line!, qty: 18, lot: 'MILL-9', useBy: '2027-05-01' }])) await saveOrQueue(c, AsyncStorage, DB, 1, ch);
    expect(odoo.tables['stock.picking']!.find((p) => p.id === s.pick)!.state).toBe('done');
    expect(odoo.tables['stock.move.line']![0]).toMatchObject({ lot_name: 'MILL-9', expiration_date: '2027-05-01 12:00:00', quantity: 18 });
  });
});

describe('ingredients screen', () => {
  test('an inventory worker orders a low ingredient from its usual supplier', async () => {
    await AsyncStorage.clear();
    const { odoo } = bakery();
    const s = pantry(odoo);
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
    await fireEvent.press(screen.getByTestId('ing-low'));
    await settle();
    expect(screen.getByTestId(`low-${s.rule}`)).toHaveTextContent(/Flour/);
    await fireEvent.press(screen.getByTestId(`order-${s.rule}`));
    await settle();
    await fireEvent.press(screen.getByTestId(`usual-${s.mill}`));
    await settle();
    expect(screen.getByTestId('order-qty').props.value).toBe('18');
    await fireEvent.changeText(screen.getByTestId('order-qty'), '20');
    await fireEvent.press(screen.getByTestId('place-order'));
    await settle();
    expect(odoo.tables['purchase.order']![0]).toMatchObject({ partner_id: s.mill, state: 'purchase' });
  });
});
