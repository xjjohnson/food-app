/**
 * Switches for testing from the Developer screen. Kept in memory only, so a
 * restart always puts the app back to normal. While any is on, a red
 * "TEST MODE" label floats on every screen (components/TestModeBanner.tsx).
 */
import type { RoleId } from './roles';

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function onDevFlags(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let offline = false;

/** When on, every Odoo call fails as if there were no signal, so the waiting list can be tried. */
export function pretendOffline(): boolean {
  return offline;
}

export function setPretendOffline(on: boolean) {
  offline = on;
  changed();
}

/** slow: every Odoo call waits 5 seconds first. flaky: every 4th call fails as if the signal dropped. */
export type Signal = 'normal' | 'slow' | 'flaky';
export const SLOW_MS = 5000;
let signal: Signal = 'normal';
let flakyCount = 0;

export function weakSignal(): Signal {
  return signal;
}

export function setWeakSignal(s: Signal) {
  signal = s;
  flakyCount = 0;
  changed();
}

/** True when this call should fail under the flaky setting. */
export function flakyDrop(): boolean {
  if (signal !== 'flaky') return false;
  flakyCount += 1;
  return flakyCount % 4 === 0;
}

let preview: RoleId | null = null;

/**
 * Looking at the app as one role: only the screens that role sees show.
 * Only the app's view changes; what Odoo lets the person do is the same.
 */
export function rolePreview(): RoleId | null {
  return preview;
}

export function setRolePreview(p: RoleId | null) {
  preview = p;
  changed();
}

/** For tests: everything back to normal. */
export function resetDevFlags() {
  offline = false;
  signal = 'normal';
  flakyCount = 0;
  preview = null;
  changed();
}
