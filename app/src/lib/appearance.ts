import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

/** Light, dark, or whatever the phone is set to. Kept on this phone only; it is a look, not Odoo data. */
export type Appearance3 = 'phone' | 'light' | 'dark';
export const APPEARANCE_KEY = 'app/appearance';

export const APPEARANCES: { id: Appearance3; label: string }[] = [
  { id: 'phone', label: 'Phone setting' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export async function loadAppearance(): Promise<Appearance3> {
  try {
    const v = await AsyncStorage.getItem(APPEARANCE_KEY);
    return v === 'light' || v === 'dark' ? v : 'phone';
  } catch {
    return 'phone';
  }
}

/** Make the whole app use this look now. 'phone' hands control back to the phone. */
export function applyAppearance(mode: Appearance3) {
  try {
    Appearance.setColorScheme(mode === 'phone' ? 'unspecified' : mode);
  } catch {
    // Not available here (for example in tests); the saved choice still applies next start.
  }
}

export async function saveAppearance(mode: Appearance3) {
  try {
    await AsyncStorage.setItem(APPEARANCE_KEY, mode);
  } catch {
    // The look still changes for now.
  }
  applyAppearance(mode);
}
