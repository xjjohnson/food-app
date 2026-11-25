import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { claimIfUnowned, dataMatches, dbId, resumeSwitch, SECRET_KEY } from './dbSwitch';
import { deviceSnapshots } from './dbSnapshots';
import { log } from './log';
import { Fetch, ODOO_STORAGE_KEY, OdooClient, OdooError, OdooLogin, OdooSession } from './odoo';
import { deviceSecrets, SecretStore } from './secrets';

const WRONG_DB = 'The data on this phone belongs to a different Odoo database. Use the Developer screen, Switch database, so nothing is sent to the wrong one.';

type Status = 'loading' | 'signedOut' | 'signingIn' | 'signedIn';

export interface OdooApi {
  status: Status;
  client: OdooClient | null;
  /** True when signed in from the saved details because Odoo couldn't be reached. Work carries on and queues. */
  offline: boolean;
  /** The database the phone's data belongs to (dbSwitch.dbId), '' when signed out. */
  db: string;
  /** The last sign-in details, to fill the form. */
  saved: OdooLogin | null;
  error: string | null;
  signIn: (login: OdooLogin, secret: string) => Promise<boolean>;
  signOut: () => void;
  /** Signs in again with the saved key, for example when signal comes back. */
  refresh: () => Promise<boolean>;
}

const Ctx = createContext<OdooApi | null>(null);

interface Saved extends OdooLogin {
  session?: OdooSession;
}

export function parseSaved(raw: string | null): Saved | null {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (d && typeof d.url === 'string' && typeof d.db === 'string' && typeof d.login === 'string') {
      const s = d.session;
      const session = s && typeof s.uid === 'number' && s.url === d.url && s.db === d.db ? (s as OdooSession) : undefined;
      return { url: d.url, db: d.db, login: d.login, session };
    }
  } catch {
    // Ignore a damaged entry.
  }
  return null;
}

/**
 * The Odoo sign-in. Signs in again on its own when the app opens if a key was
 * saved. With no signal at that moment it carries on from the saved details,
 * so the team can keep working; changes wait in the queue.
 */
export function OdooProvider({ children, fetchFn, secrets: givenSecrets }: { children: ReactNode; fetchFn?: Fetch; secrets?: SecretStore }) {
  const secrets = useMemo(() => givenSecrets ?? deviceSecrets(), [givenSecrets]);
  const doFetch = useMemo<Fetch>(() => fetchFn ?? ((url, init) => fetch(url, init)), [fetchFn]);
  const [status, setStatus] = useState<Status>('loading');
  const [client, setClient] = useState<OdooClient | null>(null);
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const current = useRef<OdooClient | null>(null);
  current.current = client;

  const signIn = useCallback(
    async (login: OdooLogin, secret: string, cached?: OdooSession) => {
      const n = ++attempt.current;
      if (!cached) setStatus('signingIn');
      setError(null);
      // Data made for one database is never sent to another: a different one goes through Switch database.
      if (!(await dataMatches(AsyncStorage, login))) {
        setClient(null);
        setStatus('signedOut');
        setError(WRONG_DB);
        return false;
      }
      try {
        const c = await OdooClient.signIn(doFetch, login, secret);
        if (n !== attempt.current) return false;
        const keep: Saved = { url: c.session.url, db: c.session.db, login: c.session.login, session: c.session };
        setSaved(keep);
        setClient(c);
        setOffline(false);
        setStatus('signedIn');
        claimIfUnowned(AsyncStorage, keep);
        AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(keep)).catch(() => undefined);
        await secrets.set(SECRET_KEY, secret);
        log.info('app', `signed in to ${c.session.db} as user ${c.session.uid}`);
        return true;
      } catch (e) {
        if (n !== attempt.current) return false;
        if (cached && e instanceof OdooError && e.kind === 'network') {
          // No signal right now: keep working as the saved person. Calls go through once signal is back.
          const same = current.current && current.current.session.uid === cached.uid && dbId(current.current.session) === dbId(cached);
          if (!same) setClient(new OdooClient(doFetch, cached, secret));
          setOffline(true);
          setStatus('signedIn');
          return false;
        }
        setClient(null);
        setOffline(false);
        setStatus('signedOut');
        setError(e instanceof OdooError ? e.message : "Couldn't sign in to Odoo.");
        return false;
      }
    },
    [doFetch, secrets],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      // Finish a database switch the app was closed in the middle of, before anything reads the phone's data.
      await resumeSwitch({ storage: AsyncStorage, snapshots: deviceSnapshots(), secrets }).catch(() => false);
      const login = parseSaved(await AsyncStorage.getItem(ODOO_STORAGE_KEY).catch(() => null));
      if (!alive) return;
      setSaved(login);
      // The keystore can fail to answer for a moment right after a restart; ask a few times before giving up.
      let secret = login ? await secrets.get(SECRET_KEY) : null;
      for (let i = 0; login && !secret && alive && i < 3; i++) {
        await new Promise((r) => setTimeout(r, 250));
        secret = await secrets.get(SECRET_KEY);
      }
      if (!alive) return;
      if (login && secret) await signIn(login, secret, login.session);
      else setStatus('signedOut');
    })();
    return () => {
      alive = false;
    };
  }, [secrets, signIn]);

  const signOut = useCallback(() => {
    attempt.current++;
    setClient(null);
    setOffline(false);
    setStatus('signedOut');
    setError(null);
    secrets.remove(SECRET_KEY);
  }, [secrets]);

  const refresh = useCallback(async () => {
    const secret = saved ? await secrets.get(SECRET_KEY) : null;
    if (!saved || !secret) return false;
    return signIn(saved, secret, client?.session ?? saved.session);
  }, [saved, secrets, signIn, client]);

  const db = client ? dbId(client.session) : '';
  const api = useMemo<OdooApi>(
    () => ({ status, client, offline, db, saved, error, signIn: (l, s) => signIn(l, s), signOut, refresh }),
    [status, client, offline, db, saved, error, signIn, signOut, refresh],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** The sign-in where there is one above; null in a bare component (some tests). */
export function useOdooIfAny(): OdooApi | null {
  return useContext(Ctx);
}

export function useOdoo(): OdooApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useOdoo needs an OdooProvider above it');
  return api;
}
