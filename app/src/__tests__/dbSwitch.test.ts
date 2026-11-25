import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataMatches, dbId, kindOf, OWNER_KEY, resumeSwitch, secretFor, setDbKind, switchDatabase } from '../lib/dbSwitch';
import { deviceSnapshots } from '../lib/dbSnapshots';
import { enqueue, loadQueue } from '../lib/queue';
import { deviceSecrets } from '../lib/secrets';
import { BETA_KEY } from '../lib/updateChannel';

const live = { url: 'https://food.hivemindjohnson.work', db: 'food', login: 'justin@example.com' };
const test_ = { url: 'https://test.food.example.com', db: 'food-test', login: 'justin@example.com' };
const deps = () => ({ storage: AsyncStorage, snapshots: deviceSnapshots(), secrets: deviceSecrets() });

describe('switching to the test database', () => {
  test('the live database’s waiting changes stay with it, are not sent to the test copy, and come back on switching back', async () => {
    await AsyncStorage.setItem(OWNER_KEY, dbId(live));
    await AsyncStorage.setItem(BETA_KEY, '1');
    await enqueue(AsyncStorage, dbId(live), 1, { label: 'Live count', model: 'stock.quant', method: 'write', args: [] });
    await deviceSecrets().set('odoo.secret', 'live-key');

    await switchDatabase(deps(), live, test_, 'test-key');
    expect(await loadQueue(AsyncStorage)).toEqual([]);
    expect(await dataMatches(AsyncStorage, test_)).toBe(true);
    expect(await dataMatches(AsyncStorage, live)).toBe(false);
    // The beta choice is the phone's, not the database's.
    expect(await AsyncStorage.getItem(BETA_KEY)).toBe('1');
    expect(await deviceSecrets().get(secretFor(dbId(live)))).toBe('live-key');

    await switchDatabase(deps(), test_, live, 'live-key');
    expect((await loadQueue(AsyncStorage)).map((x) => x.label)).toEqual(['Live count']);
  });

  test('a switch the app was closed in the middle of finishes on the next start', async () => {
    await AsyncStorage.setItem('dbswitch/journal', JSON.stringify({ from: '', to: test_ }));
    expect(await resumeSwitch(deps())).toBe(true);
    expect(await AsyncStorage.getItem(OWNER_KEY)).toBe(dbId(test_));
  });

  test('only one database is marked live', async () => {
    await setDbKind(AsyncStorage, live, 'live');
    await setDbKind(AsyncStorage, test_, 'test');
    expect(await kindOf(AsyncStorage, live)).toBe('live');
    expect(await kindOf(AsyncStorage, test_)).toBe('test');
    await setDbKind(AsyncStorage, test_, 'live');
    expect(await kindOf(AsyncStorage, live)).toBeNull();
  });
});
