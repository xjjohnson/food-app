import { clearCache, readCache, writeCache, MAX_AGE_MS, CACHE_PREFIX } from '../lib/dataCache';

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    getAllKeys: async () => [...m.keys()],
    multiRemove: async (ks: readonly string[]) => void ks.forEach((k) => m.delete(k)),
  };
}

describe('saved copies of Odoo answers', () => {
  const a = { db: 'x|food', uid: 2 };
  test('come back for the same person and database only', async () => {
    const s = memStore();
    await writeCache(s, a, 'today', [1, 2]);
    expect(await readCache(s, a, 'today')).toEqual([1, 2]);
    expect(await readCache(s, { ...a, uid: 3 }, 'today')).toBeNull();
    expect(await readCache(s, { ...a, db: 'x|test' }, 'today')).toBeNull();
  });
  test('old copies are not shown', async () => {
    const s = memStore();
    await writeCache(s, a, 'k', 1, 1000);
    expect(await readCache(s, a, 'k', 1000 + MAX_AGE_MS + 1)).toBeNull();
  });
  test('sign-out clears them and leaves other storage alone', async () => {
    const s = memStore();
    await writeCache(s, a, 'k', 1);
    s.m.set('queue/v1', '[]');
    await clearCache(s);
    expect([...s.m.keys()]).toEqual(['queue/v1']);
    expect(CACHE_PREFIX).toBe('cache/');
  });
});
