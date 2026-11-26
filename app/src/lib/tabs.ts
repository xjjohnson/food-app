/**
 * The five tabs along the bottom (Today, Make, Buy, Sell, More), which one
 * shows for which role, and what the plus button offers. Pure, so tests can
 * check who sees what.
 */
import { AREAS, areaById } from './areas';
import { canSee, hasAnyRole, type Roles } from './roles';

export type TabId = 'index' | 'make' | 'buy' | 'sell' | 'more';

export const TABS: { id: TabId; label: string; mark: string; title: string; areas: string[] }[] = [
  { id: 'index', label: 'Today', mark: '●', title: 'Today', areas: [] },
  { id: 'make', label: 'Make', mark: '◍', title: 'Make', areas: ['production', 'stock', 'safety'] },
  { id: 'buy', label: 'Buy', mark: '◍', title: 'Buy', areas: ['ingredients'] },
  { id: 'sell', label: 'Sell', mark: '◍', title: 'Sell', areas: ['orders', 'invoices', 'sell', 'market'] },
  { id: 'more', label: 'More', mark: '≡', title: 'More', areas: [] },
];

/** The work areas of a tab that this person may open. */
export function tabAreas(tab: TabId, roles: Roles) {
  const t = TABS.find((x) => x.id === tab);
  return (t?.areas ?? []).map((id) => areaById(id)).filter((a): a is NonNullable<typeof a> => !!a && canSee(roles, a.role));
}

/** Today and More always show; a work tab shows when the person may open something in it. */
export function tabVisible(tab: TabId, roles: Roles): boolean {
  if (tab === 'index' || tab === 'more') return true;
  return hasAnyRole(roles) && tabAreas(tab, roles).length > 0;
}

export interface PlusChoice {
  id: string;
  label: string;
  /** Route to open. */
  href: string;
}

const ALL: (PlusChoice & { area?: string })[] = [
  { id: 'batch', label: 'Start a batch', href: '/area/production?go=start', area: 'production' },
  { id: 'bought', label: 'I bought something', href: '/area/ingredients?go=bought', area: 'ingredients' },
  { id: 'quote', label: 'New quote or order', href: '/area/sell?go=quote', area: 'sell' },
  { id: 'task', label: 'A task', href: '/tasks' },
];

/** What the plus button offers this person. Nothing for someone with no role. */
export function plusChoices(roles: Roles): PlusChoice[] {
  if (!hasAnyRole(roles)) return [];
  return ALL.filter((c) => !c.area || (areaById(c.area) && canSee(roles, areaById(c.area)!.role))).map(({ id, label, href }) => ({ id, label, href }));
}

export const AREA_IDS = AREAS.map((a) => a.id);
