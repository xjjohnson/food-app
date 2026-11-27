/**
 * The red count dots: which Today counts go on which tab and which row.
 * Counts only, inside the app (no phone alerts). Zero shows nothing.
 * Kept free of React so tests can check it.
 */
import type { TabId } from './tabs';
import type { TodayItem } from './today';

export interface Badges {
  tabs: Partial<Record<TabId, number>>;
  /** By row test id, for rows in the Buy, Make and Sell tabs. */
  rows: Record<string, number>;
}

const n = (items: TodayItem[], id: string) => items.find((i) => i.id === id)?.count ?? 0;

/** The show text for a count: 1 to 99, then 99+. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Works out every dot from the Today counts and the number of stuck saves. */
export function buildBadges(items: TodayItem[], stuck: number): Badges {
  const tabs: Badges['tabs'] = {
    index: n(items, 'tasks'),
    buy: n(items, 'low') + n(items, 'deliveries'),
    make: n(items, 'batches') + n(items, 'expiring'),
    sell: n(items, 'orders'),
    more: stuck,
  };
  const rows: Badges['rows'] = {
    'buy-low': n(items, 'low'),
    'make-open-batches': n(items, 'batches'),
    'make-open-jars': n(items, 'expiring'),
    'area-invoices': n(items, 'owed'),
  };
  for (const k of Object.keys(tabs) as TabId[]) if (!tabs[k]) delete tabs[k];
  for (const k of Object.keys(rows)) if (!rows[k]) delete rows[k];
  return { tabs, rows };
}
