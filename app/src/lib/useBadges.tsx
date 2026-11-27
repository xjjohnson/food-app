import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Badges, buildBadges } from './badges';
import { loadToday } from './today';
import { useAppForeground } from './useAppForeground';
import { useOdoo } from './useOdoo';
import { useQueue } from './useQueue';
import { useRoles } from './useRoles';

const EMPTY: Badges = { tabs: {}, rows: {} };
const Ctx = createContext<Badges>(EMPTY);

/** How often the dots are read again while the app is open. */
export const BADGE_MS = 120_000;

/** Reads the counts for the dots: after sign-in, when the app comes back, and every two minutes. Read only; nothing is saved. */
export function BadgeProvider({ children }: { children: ReactNode }) {
  const { client, offline, status } = useOdoo();
  const { roles } = useRoles();
  const { items: queued } = useQueue();
  const [today, setToday] = useState<Awaited<ReturnType<typeof loadToday>>>([]);
  const [tick, setTick] = useState(0);
  const stuck = queued.filter((x) => x.state === 'stuck').length;

  useAppForeground(useCallback(() => setTick((t) => t + 1), []));
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), BADGE_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!client || offline || status !== 'signedIn') return;
    let alive = true;
    loadToday(client, roles)
      .then((r) => alive && setToday(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, offline, status, roles, tick]);

  const value = useMemo(() => (client && status === 'signedIn' ? buildBadges(today, stuck) : EMPTY), [client, status, today, stuck]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBadges = () => useContext(Ctx);
