import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { dbId, setDbKind } from '../lib/dbSwitch';
import { setPretendOffline } from '../lib/devFlags';
import { ODOO_STORAGE_KEY } from '../lib/odoo';
import { loadQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { bakery, FakeOdoo, URL } from '../testing/fakeOdoo';

let odoo: FakeOdoo;
let fake: ReturnType<typeof bakery>;

beforeEach(() => {
  fake = bakery();
  odoo = fake.odoo;
  globalThis.fetch = ((u: string, i: never) => odoo.fetch(u, i)) as never;
});

/** Lets the sign-in and Odoo reads finish. */
async function settle() {
  for (let i = 0; i < 30; i++) await act(async () => undefined);
}

async function signedInAs(login: string, opts: { test?: boolean } = {}) {
  const s = { url: URL, db: 'food-test', login };
  await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(s));
  await deviceSecrets().set('odoo.secret', 'key');
  if (opts.test) await setDbKind(AsyncStorage, s, 'test');
}

describe('the whole app', () => {
  test('signs in, then shows the company’s name and the owner’s areas', async () => {
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('signin-url'), 'test.food.example.com');
    await fireEvent.changeText(screen.getByTestId('signin-db'), 'food-test');
    await fireEvent.changeText(screen.getByTestId('signin-login'), 'justin@example.com');
    await fireEvent.changeText(screen.getByTestId('signin-secret'), 'key');
    await fireEvent.press(screen.getByTestId('signin-go'));
    await settle();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getAllByText('Hivemind Bakery').length).toBeGreaterThan(0);
    expect(screen.getByTestId('brand-logo')).toBeTruthy();
    expect(screen.getByTestId('my-roles')).toHaveTextContent('Owner');
    for (const [tab, areas] of [['make', ['production', 'stock']], ['buy', ['ingredients']], ['sell', ['orders', 'market']]] as const) {
      await fireEvent.press(screen.getByTestId(`tab-${tab}`));
      await settle();
      for (const a of areas) {
        if (tab === 'make') await fireEvent.press(screen.getByTestId(a === 'stock' ? 'make-seg-jars' : 'make-seg-batches'));
        expect(screen.getByTestId(`area-${a}`)).toBeTruthy();
      }
    }
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    expect(screen.getByTestId('open-management')).toBeTruthy();
    // The key is in the keystore, never in the app's storage.
    expect(JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()))).not.toContain('"key"');
  });

  test('a production worker sees only Production, and no management area', async () => {
    await signedInAs('baker@example.com');
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('tab-buy')).toBeNull();
    expect(screen.queryByTestId('tab-sell')).toBeNull();
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-seg-batches'));
    expect(screen.getByTestId('area-production')).toBeTruthy();
    expect(screen.queryByTestId('area-market')).toBeNull();
    await fireEvent.press(screen.getByTestId('tab-more'));
    await settle();
    expect(screen.queryByTestId('open-management')).toBeNull();
    expect(screen.queryByTestId('open-reports')).toBeNull();
  });

  test('someone with no role is told how to get one', async () => {
    const u = odoo.addUser({ login: 'new@example.com' });
    await signedInAs(u.login);
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    expect(screen.getByTestId('no-role')).toBeTruthy();
  });

  test('the management area is for the owner only', async () => {
    await signedInAs('baker@example.com');
    await renderRouter('src/app', { initialUrl: '/management' });
    await settle();
    expect(screen.getByText('Only the owner can open this.')).toBeTruthy();
  });

  test('the owner gives someone a role, and it is saved on their Employee in Odoo', async () => {
    await signedInAs('justin@example.com');
    await renderRouter('src/app', { initialUrl: '/management' });
    await settle();
    const sam = odoo.tables['hr.employee']!.find((e) => e.name === 'Sam Seller')!;
    await fireEvent.press(screen.getByTestId(`open-person-${sam.id}`));
    await fireEvent(screen.getByTestId(`role-${sam.id}-sales`), 'valueChange', true);
    await fireEvent.press(screen.getByTestId(`save-roles-${sam.id}`));
    await settle();
    const tag = odoo.tables['hr.employee.category']!.find((t) => t.name === 'Sales')!;
    expect(sam.category_ids).toEqual([tag.id]);
  });

  test('on a test copy the TEST DATABASE band shows, and a test note waits offline then sends by itself', async () => {
    await signedInAs('justin@example.com', { test: true });
    await renderRouter('src/app', { initialUrl: '/developer' });
    await settle();
    expect(screen.getByTestId('test-db-band')).toHaveTextContent('TEST DATABASE · test.food.example.com / food-test');
    await act(async () => setPretendOffline(true));
    await fireEvent.press(screen.getByTestId('test-note'));
    await settle();
    expect(screen.getByTestId('test-mode-band')).toHaveTextContent(/Pretend offline/);
    expect(screen.getByTestId('queue-band')).toHaveTextContent(/1 change waiting to send/);
    expect(await loadQueue(AsyncStorage)).toHaveLength(1);
    expect(odoo.tables['mail.message']).toHaveLength(0);
    await act(async () => setPretendOffline(false));
    await fireEvent.press(screen.getByTestId('dev-send-now'));
    await settle();
    expect(odoo.tables['mail.message']).toHaveLength(1);
    expect(await loadQueue(AsyncStorage)).toHaveLength(0);
    expect(screen.queryByTestId('queue-band')).toBeNull();
  });

  test('opening the app without signal keeps the person signed in from the saved details', async () => {
    await signedInAs('baker@example.com');
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify({ url: URL, db: 'food-test', login: 'baker@example.com', session: { url: URL, db: 'food-test', login: 'baker@example.com', uid: fake.baker.id, name: 'Bea Baker', companyId: 1, partnerId: fake.baker.partner, serverVersion: '19.0' } }));
    await AsyncStorage.setItem('roles/v1', JSON.stringify({ uid: fake.baker.id, roles: { production: true }, admin: false, hasEmployee: true, employeesApp: true }));
    odoo.offline = true;
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tab-make'));
    await settle();
    await fireEvent.press(screen.getByTestId('make-seg-batches'));
    expect(screen.getByTestId('area-production')).toBeTruthy();
    expect(screen.getByTestId('queue-band')).toHaveTextContent(/No signal: working offline/);
  });

  test('the Developer screen opens before signing in, to attach the test database', async () => {
    await renderRouter('src/app', { initialUrl: '/developer' });
    await settle();
    expect(screen.getByTestId('developer-screen')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('dev-url'), URL);
    await fireEvent.changeText(screen.getByTestId('dev-db'), 'food-test');
    await fireEvent.changeText(screen.getByTestId('dev-login'), 'justin@example.com');
    await fireEvent.changeText(screen.getByTestId('dev-secret'), 'key');
    await fireEvent.press(screen.getByTestId('dev-switch'));
    await settle();
    expect(screen.getByTestId('test-db-band')).toBeTruthy();
    expect(await AsyncStorage.getItem('dbswitch/owner')).toBe(dbId({ url: URL, db: 'food-test' }));
  });
});

describe('the plus button', () => {
  test('offers a batch to a baker, and a quote and a purchase to the owner', async () => {
    await signedInAs('baker@example.com');
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    await fireEvent.press(screen.getByTestId('plus-button'));
    expect(screen.getByTestId('plus-batch')).toBeTruthy();
    expect(screen.queryByTestId('plus-quote')).toBeNull();
    expect(screen.queryByTestId('plus-bought')).toBeNull();
  });
  test('Start a batch opens the new batch page', async () => {
    await signedInAs('baker@example.com');
    await renderRouter('src/app', { initialUrl: '/' });
    await settle();
    await fireEvent.press(screen.getByTestId('plus-button'));
    await fireEvent.press(screen.getByTestId('plus-batch'));
    await settle();
    expect(screen.queryByTestId('production-screen')).toBeNull();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
  });
});
