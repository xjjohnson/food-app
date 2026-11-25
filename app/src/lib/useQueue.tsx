import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { forDb, loadQueue, NewChange, QueuedChange, removeChange, retryChange, saveOrQueue, SaveOutcome, sendQueue, SendResult } from './queue';
import { useAppForeground } from './useAppForeground';
import { useOdoo } from './useOdoo';

/** While changes are waiting, try sending this often. */
export const RETRY_MS = 60_000;

interface QueueApi {
  /** This database's changes not in Odoo yet, oldest first. */
  items: QueuedChange[];
  sending: boolean;
  last: SendResult | null;
  /** Saves to Odoo now, or keeps it to send when signal is back. */
  save: (change: NewChange) => Promise<SaveOutcome>;
  sendNow: () => Promise<SendResult | null>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const Ctx = createContext<QueueApi | null>(null);

/**
 * Keeps the offline queue moving: sends after sign-in, when the app comes back
 * to the screen, and every minute while anything is waiting.
 */
export function QueueProvider({ children }: { children: ReactNode }) {
  const { client, db, offline, refresh } = useOdoo();
  const [items, setItems] = useState<QueuedChange[]>([]);
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<SendResult | null>(null);
  const running = useRef<Promise<SendResult | null> | null>(null);

  const reload = useCallback(async () => {
    setItems(db ? forDb(await loadQueue(AsyncStorage), db) : []);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const sendNow = useCallback(async () => {
    if (!client || !db) return null;
    // One run at a time, so nothing is sent twice.
    if (running.current) return running.current;
    const run = (async () => {
      setSending(true);
      try {
        // Signed in from saved details without signal: check Odoo is back first.
        if (offline) await refresh();
        const r = await sendQueue(client, AsyncStorage, db);
        setLast(r);
        return r;
      } finally {
        setSending(false);
        await reload();
        running.current = null;
      }
    })();
    running.current = run;
    return run;
  }, [client, db, offline, refresh, reload]);

  // Send after signing in, and when signal comes back.
  useEffect(() => {
    if (db && !offline) sendNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, offline]);

  useAppForeground(() => {
    if (items.length) sendNow();
  });

  const waitingCount = items.filter((x) => x.state === 'waiting').length;
  useEffect(() => {
    if (!waitingCount) return;
    const t = setInterval(() => sendNow(), RETRY_MS);
    return () => clearInterval(t);
  }, [waitingCount, sendNow]);

  const save = useCallback(
    async (change: NewChange) => {
      if (!db) throw new Error('Sign in to Odoo first.');
      const r = await saveOrQueue(offline ? null : client, AsyncStorage, db, client?.session.uid ?? 0, change);
      await reload();
      if (r.status === 'queued' && client && !offline) sendNow();
      return r;
    },
    [client, db, offline, reload, sendNow],
  );

  const retry = useCallback(
    async (id: string) => {
      await retryChange(AsyncStorage, id);
      await reload();
      sendNow();
    },
    [reload, sendNow],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeChange(AsyncStorage, id);
      await reload();
    },
    [reload],
  );

  const api = useMemo(() => ({ items, sending, last, save, sendNow, retry, remove }), [items, sending, last, save, sendNow, retry, remove]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useQueue(): QueueApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useQueue needs a QueueProvider above it');
  return api;
}
