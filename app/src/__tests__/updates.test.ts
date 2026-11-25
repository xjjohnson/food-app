import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkAndFetchOta } from '../lib/otaUpdate';
import { BETA_KEY, readBeta, restoreBeta, setBeta } from '../lib/updateChannel';

describe('beta updates', () => {
  test('beta asks for the beta channel; off goes back to production', async () => {
    const set = jest.fn();
    const api = { isEnabled: true, setUpdateRequestHeadersOverride: set };
    expect(await setBeta(true, api)).toBe(true);
    expect(set).toHaveBeenLastCalledWith({ 'expo-channel-name': 'beta' });
    expect(await readBeta()).toBe(true);
    expect(await setBeta(false, api)).toBe(true);
    expect(set).toHaveBeenLastCalledWith(null);
    expect(await AsyncStorage.getItem(BETA_KEY)).toBe('0');
  });

  test('a build without updates says it can’t switch, and saves nothing', async () => {
    expect(await setBeta(true, { isEnabled: false })).toBe(false);
    expect(await readBeta()).toBe(false);
  });

  test('the saved choice is put back at start', async () => {
    await AsyncStorage.setItem(BETA_KEY, '1');
    const set = jest.fn();
    await restoreBeta({ isEnabled: true, setUpdateRequestHeadersOverride: set });
    expect(set).toHaveBeenCalledWith({ 'expo-channel-name': 'beta' });
  });

  test('an update check never throws', async () => {
    expect(await checkAndFetchOta({ isEnabled: false, checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn() })).toBe('off');
    expect(await checkAndFetchOta({ isEnabled: true, checkForUpdateAsync: () => Promise.reject(new Error('no signal')), fetchUpdateAsync: jest.fn() })).toBe('unknown');
    expect(await checkAndFetchOta({ isEnabled: true, checkForUpdateAsync: async () => ({ isAvailable: true }), fetchUpdateAsync: async () => ({ isNew: true }) })).toBe('ready');
  });
});
