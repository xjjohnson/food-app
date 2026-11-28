import AsyncStorage from '@react-native-async-storage/async-storage';
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { readCache, writeCache } from './dataCache';
import { useOdooIfAny } from './useOdoo';

/**
 * Shows the last saved answer at once, then reads Odoo in the background and
 * swaps in the fresh answer (and saves it for next time).
 * `key` names the data (include search words and filters). Pass `enabled` false to wait.
 * `ownerOnly` data is only saved and shown when `ownerOnly` is true for this person.
 */
export function useCachedLoad<T>(key: string, load: () => Promise<T>, deps: DependencyList, opts: { enabled?: boolean; ownerOnly?: boolean; isOwner?: boolean } = {}) {
  const odoo = useOdooIfAny();
  const uid = odoo?.client?.session.uid ?? 0;
  const db = odoo?.db ?? '';
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const enabled = opts.enabled !== false;
  const allowed = !opts.ownerOnly || !!opts.isOwner;

  useEffect(() => {
    if (!enabled || !allowed) return;
    let alive = true;
    const who = { db, uid };
    if (db && uid) {
      readCache<T>(AsyncStorage, who, key).then((c) => {
        if (alive && c !== null) setData((cur) => cur ?? c);
      });
    }
    setRefreshing(true);
    loadRef
      .current()
      .then((v) => {
        if (!alive) return;
        setData(v);
        setError(null);
        if (db && uid) void writeCache(AsyncStorage, who, key, v);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setRefreshing(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, db, uid, enabled, allowed, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, refreshing, reload };
}
