import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { setDbKind } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY, OdooClient } from '../lib/odoo';
import { loadCheckout, shortWords } from '../lib/orders';
import { deviceSecrets } from '../lib/secrets';
import { LOG_KINDS, setupLog } from '../lib/surveyLog';
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

/** A website order for 3 jars with a delivery method chosen at checkout. */
function order(odoo: FakeOdoo, carrierType: string, carrierName: string, state = 'assigned') {
  const jam = odoo.create('product.product', { name: 'Strawberry Jam', free_qty: 1 });
  const car = odoo.create('delivery.carrier', { name: carrierName, delivery_type: carrierType });
  const sale = odoo.create('sale.order', { name: 'S00001', carrier_id: [car, carrierName] });
  const pick = odoo.create('stock.picking', { name: 'WH/OUT/1', origin: 'S00001', partner_id: [7, 'Pat'], state, picking_type_code: 'outgoing', sale_id: [sale, 'S00001'], scheduled_date: '2026-11-27 10:00:00' });
  odoo.create('stock.move', { picking_id: pick, product_id: [jam, 'Strawberry Jam'], product_uom_qty: 3, location_id: [8, 'Stock'], location_dest_id: [5, 'Customers'], move_line_ids: [] });
  return { jam, pick, sale };
}

describe('delivery or pickup comes from the order', () => {
  test('the delivery method on the order says pickup or delivery', async () => {
    const { odoo } = bakery();
    const a = order(odoo, 'onsite', 'Pickup at the shop');
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    expect(await loadCheckout(c, a.pick)).toEqual({ label: 'Pickup at the shop', how: 'pickup' });
    odoo.tables['delivery.carrier']![0]!.delivery_type = 'fixed';
    odoo.tables['delivery.carrier']![0]!.name = 'Local delivery';
    odoo.tables['sale.order']![0]!.carrier_id = [odoo.tables['delivery.carrier']![0]!.id, 'Local delivery'];
    expect(await loadCheckout(c, a.pick)).toEqual({ label: 'Local delivery', how: 'delivery' });
    odoo.tables['sale.order']![0]!.carrier_id = false;
    expect(await loadCheckout(c, a.pick)).toBeNull();
  });

  test('short stock is said in plain words', () => {
    expect(shortWords(3, 1)).toMatch(/^Short by 2: need 3, 1 free\./);
    expect(shortWords(3, 5)).toBe('');
    expect(shortWords(3, undefined)).toBe('');
  });

  test('the pack screen says what Odoo has for delivery or pickup, with no choice to make; a waiting line says how short it is', async () => {
    const { odoo } = bakery();
    const a = order(odoo, 'onsite', 'Pickup at the shop', 'confirmed');
    await open(odoo, '/area/orders', 'Shipping & Packaging');
    await fireEvent.press(await screen.findByTestId(`order-${a.pick}`));
    await settle();
    expect(screen.getByText('Pickup (set in Odoo): Pickup at the shop')).toBeTruthy();
    expect(screen.queryByTestId('how-pickup')).toBeNull();
    expect(screen.getByTestId(`line-${odoo.tables['stock.move']![0]!.id}`)).toHaveTextContent(/Short by 2: need 3, 1 free/);
  });
});

describe('tasting from a batch', () => {
  test('a finished batch opens the Tasting log with the batch filled in', async () => {
    const { odoo } = bakery();
    const c = await OdooClient.signIn(odoo.fetch, { url: URL, db: 'food-test', login: 'baker@example.com' }, 'key');
    await setupLog(c, LOG_KINDS.find((k) => k.id === 'tasting')!);
    await open(odoo, `/area/safety?go=${encodeURIComponent('tasting:Peach Jam, batch J-5')}`, 'Production');
    const q = odoo.tables['survey.question']!.find((x) => x.title === 'Product or batch tasted')!;
    expect((await screen.findByTestId(`log-q${q.id}`)).props.value).toBe('Peach Jam, batch J-5');
  });

  test('a finished batch shows the tasting and shelf-life buttons', async () => {
    const { odoo } = bakery();
    const jam = odoo.create('product.product', { name: 'Jam', free_qty: 0 });
    const lot = odoo.create('stock.lot', { name: 'J-5', expiration_date: '2027-05-01 12:00:00' });
    const id = odoo.create('mrp.production', { name: 'WH/MO/9', state: 'done', product_id: [jam, 'Jam'], product_qty: 12, lot_producing_ids: [lot] });
    await open(odoo, `/area/production?go=batch:${id}`, 'Production');
    expect(await screen.findByTestId('batch-taste')).toBeTruthy();
    expect(screen.getByTestId('batch-shelf')).toBeTruthy();
  });
});

describe('pack, then delivered or picked up, as Odoo says', () => {
  test('a packed pickup order shows Picked up on the board; a delivery order shows Delivered', async () => {
    const { odoo } = bakery();
    const today = new Date().toISOString().slice(0, 10);
    const mk = (name: string, type: string, label: string) => {
      const car = odoo.create('delivery.carrier', { name: label, delivery_type: type });
      const sale = odoo.create('sale.order', { name, carrier_id: [car, label] });
      return odoo.create('stock.picking', { name: `WH/${name}`, origin: name, partner_id: [7, 'Pat'], state: 'done', picking_type_code: 'outgoing', sale_id: [sale, name], scheduled_date: `${today} 08:00:00`, date_done: `${today} 09:00:00` });
    };
    const pickup = mk('S0001', 'onsite', 'Pick up');
    const ship = mk('S0002', 'fixed', 'Local delivery');
    await open(odoo, '/area/orders?go=board', 'Shipping & Packaging');
    await fireEvent.press(await screen.findByText(/Drive \(2\)/));
    expect(await screen.findByTestId(`board-delivered-${ship}`)).toHaveTextContent('Delivered ›');
    expect(await screen.findByTestId(`board-delivered-${pickup}`)).toHaveTextContent('Picked up ›');
  });
});

describe('pickups and deliveries are kept apart on the board', () => {
  test('pickups sit on the Drive side with no stop number, route or address', async () => {
    const { odoo } = bakery();
    const today = new Date().toISOString().slice(0, 10);
    odoo.create('res.partner', { name: 'Pat', street: '1 Main St', zip: '78640', phone: '555-0100' });
    const mk = (name: string, type: string, label: string) => {
      const car = odoo.create('delivery.carrier', { name: label, delivery_type: type });
      const sale = odoo.create('sale.order', { name, carrier_id: [car, label] });
      return odoo.create('stock.picking', { name: `WH/${name}`, origin: name, partner_id: [odoo.tables['res.partner']!.at(-1)!.id as number, 'Pat'], state: 'done', picking_type_code: 'outgoing', sale_id: [sale, name], scheduled_date: `${today} 08:00:00`, date_done: `${today} 09:00:00` });
    };
    const d1 = mk('S0001', 'fixed', 'Local delivery');
    const d2 = mk('S0002', 'fixed', 'Local delivery');
    const pk = mk('S0003', 'onsite', 'Pick up');
    await open(odoo, '/area/orders?go=board', 'Shipping & Packaging');
    await fireEvent.press(await screen.findByText(/Drive \(3\)/));
    expect(screen.getByTestId('route-card')).toBeTruthy();
    expect(screen.getByTestId(`board-delivered-${d1}`)).toBeTruthy();
    expect(screen.getByText(/Next stop/)).toBeTruthy();
    expect(screen.getByText(/Next pickup/)).toBeTruthy();
    expect(screen.getByTestId(`stop-${d2}`)).toBeTruthy();
    expect(screen.getByTestId(`stop-up-${d2}`)).toBeTruthy();
    expect(await screen.findByTestId(`board-${pk}`)).toBeTruthy();
    expect(screen.queryByTestId(`stop-${pk}`)).toBeNull();
    expect(screen.queryByTestId(`board-map-${pk}`)).toBeNull();
    expect(await screen.findByTestId(`board-delivered-${pk}`)).toHaveTextContent('Picked up ›');
    expect(screen.queryByTestId(`board-map-${pk}`)).toBeNull();
  });
});
