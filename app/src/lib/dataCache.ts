/**
 * Saved copies of what Odoo last said, so a screen can show something at once
 * and then refresh in the background. Read-only copies: nothing in here is
 * ever sent to Odoo (saves go through the queue).
 *
 * Each copy belongs to one database and one person (the key holds both), so a
 * different person or database never sees it. It is wiped on sign-out and when
 * the database is switched (keys start with "cache/", which a switch clears).
 * Owner-only data (costs, margins, totals) is only ever read by an owner, and
 * is saved under that owner's own key, so other roles never reach it.
 * Kept free of React; storage is passed in.
 */
export const CACHE_PREFIX = 'cache/';
/** A saved copy older than this is not shown. */
export const MAX_AGE_MS = 7 * 86_400_000;

export interface CacheStore {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<unknown>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<unknown>;
}

export interface CacheWho {
  db: string;
  uid: number;
}

const fullKey = (who: CacheWho, key: string) => `${CACHE_PREFIX}${who.db}|${who.uid}|${key}`;

export async function readCache<T>(store: CacheStore, who: CacheWho, key: string, now = Date.now()): Promise<T | null> {
  try {
    const raw = await store.getItem(fullKey(who, key));
    const d = raw ? JSON.parse(raw) : null;
    if (d && typeof d.at === 'number' && now - d.at < MAX_AGE_MS && 'value' in d) return d.value as T;
  } catch {
    // Unreadable copy: act as if there is none.
  }
  return null;
}

export async function writeCache(store: CacheStore, who: CacheWho, key: string, value: unknown, now = Date.now()): Promise<void> {
  try {
    await store.setItem(fullKey(who, key), JSON.stringify({ at: now, value }));
  } catch {
    // Not saving a copy is fine.
  }
}

/** Removes every saved copy (sign-out). */
export async function clearCache(store: CacheStore): Promise<void> {
  try {
    const keys = (await store.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length) await store.multiRemove(keys);
  } catch {
    // Nothing to clear.
  }
}
