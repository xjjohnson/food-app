/**
 * Beta updates. Every change merged to main is published to the "beta"
 * channel only. A phone with Beta updates on (Developer screen) gets it right
 * away; everyone else stays on "production", which only gets an update when
 * Justin runs the APK workflow by hand with "production" picked.
 *
 * Switching asks expo-updates to send a different channel name with its
 * update checks. It takes effect after a restart, and stays until switched
 * back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BETA_CHANNEL = 'beta';
export const BETA_KEY = 'updates/beta';

/** The parts of expo-updates this needs, so tests can pass a fake. */
export interface ChannelApi {
  isEnabled: boolean;
  setUpdateRequestHeadersOverride?: (headers: Record<string, string> | null) => void;
}

export async function readBeta(): Promise<boolean> {
  return (await AsyncStorage.getItem(BETA_KEY).catch(() => null)) === '1';
}

/** Turns beta on or off. Returns false when this build can't switch (Expo Go, dev builds, no update address yet). */
export async function setBeta(on: boolean, api: ChannelApi): Promise<boolean> {
  if (!api.isEnabled || typeof api.setUpdateRequestHeadersOverride !== 'function') return false;
  // Off goes back to the channel the APK was built with (production).
  api.setUpdateRequestHeadersOverride(on ? { 'expo-channel-name': BETA_CHANNEL } : null);
  await AsyncStorage.setItem(BETA_KEY, on ? '1' : '0');
  return true;
}

/** At start: puts back the beta choice saved earlier, in case expo-updates forgot it. */
export async function restoreBeta(api: ChannelApi): Promise<void> {
  if (await readBeta()) await setBeta(true, api).catch(() => false);
}
