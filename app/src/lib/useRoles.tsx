import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onDevFlags, rolePreview } from './devFlags';
import { log } from './log';
import { MyRoles, NO_ROLES, readMyRoles, Roles } from './roles';
import { useOdoo } from './useOdoo';

export const ROLES_KEY = 'roles/v1';

interface RolesApi {
  /** What the screens use: the real roles, or only the previewed one (Developer, Look at the app as). */
  roles: Roles;
  /** The person's real roles from Odoo. */
  mine: MyRoles | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<RolesApi | null>(null);

/** The previewed role alone, when one is picked on the Developer screen. Only an owner can preview. */
export function applyPreview(real: Roles): Roles {
  const p = rolePreview();
  if (!p || !real.owner) return real;
  return { ...NO_ROLES, [p]: true };
}

/**
 * The signed-in person's roles, read from Odoo after sign-in and kept on the
 * phone so the right screens show without signal.
 */
export function RolesProvider({ children }: { children: ReactNode }) {
  const { client, offline } = useOdoo();
  const [mine, setMine] = useState<MyRoles | null>(null);
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => onDevFlags(() => tick((n) => n + 1)), []);

  const uid = client?.session.uid ?? 0;

  const reload = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const r = await readMyRoles(client);
      setMine(r);
      AsyncStorage.setItem(ROLES_KEY, JSON.stringify({ uid: client.session.uid, ...r })).catch(() => undefined);
    } catch (e) {
      log.warn('roles', `couldn't read roles: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let alive = true;
    setMine(null);
    if (!uid) return;
    (async () => {
      // The saved roles first, so screens show at once (and without signal).
      try {
        const raw = await AsyncStorage.getItem(ROLES_KEY);
        const d = raw ? JSON.parse(raw) : null;
        if (alive && d && d.uid === uid && d.roles) setMine({ roles: { ...NO_ROLES, ...d.roles }, admin: !!d.admin, hasEmployee: !!d.hasEmployee, employeesApp: !!d.employeesApp });
      } catch {
        // Nothing saved.
      }
      if (alive && !offline) await reload();
    })();
    return () => {
      alive = false;
    };
  }, [uid, offline, reload]);

  const roles = applyPreview(mine?.roles ?? NO_ROLES);
  const api = useMemo(() => ({ roles, mine, loading, reload }), [roles, mine, loading, reload]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useRoles(): RolesApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useRoles needs a RolesProvider above it');
  return api;
}
