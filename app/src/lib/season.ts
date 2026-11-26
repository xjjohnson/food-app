/**
 * Seasons for products (pumpkin butter in the fall): a start and an end day
 * each year, typed by the owner and kept in the Food app settings. Today shows
 * what is in season and what starts soon. The app never switches a product on
 * the shop by itself; the person does that on On the shop.
 */
import type { Settings } from './appSettings';

export const seasonKey = (productId: number) => `season.${productId}`;

export interface Season {
  /** "MM-DD". */
  start: string;
  end: string;
}

const MD = /^(\d{2})-(\d{2})$/;
export const validDay = (t: string) => {
  const m = MD.exec(t.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(2024, month, 0).getDate();
};

export const seasonToLine = (s: Season) => `${s.start.trim()}|${s.end.trim()}`;

export function seasonFromLine(line: string | undefined): Season | null {
  const [start, end] = (line ?? '').split('|');
  return start && end && validDay(start) && validDay(end) ? { start, end } : null;
}

const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** True when today falls in the season. A season may cross New Year (11-15 to 01-05). */
export function inSeason(s: Season, now = new Date()): boolean {
  const t = md(now);
  return s.start <= s.end ? t >= s.start && t <= s.end : t >= s.start || t <= s.end;
}

/** Days until the season next starts, or 0 when it is on now. */
export function daysUntilStart(s: Season, now = new Date()): number {
  if (inSeason(s, now)) return 0;
  const [m, d] = s.start.split('-').map(Number) as [number, number];
  let next = new Date(now.getFullYear(), m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export interface SeasonCount {
  now: number;
  soon: number;
}

/** How many products are in season, and how many start within `days`. */
export function seasonCounts(settings: Settings, days = 14, now = new Date()): SeasonCount {
  let nowN = 0;
  let soon = 0;
  for (const [k, v] of Object.entries(settings)) {
    if (!k.startsWith('season.')) continue;
    const s = seasonFromLine(v);
    if (!s) continue;
    if (inSeason(s, now)) nowN++;
    else if (daysUntilStart(s, now) <= days) soon++;
  }
  return { now: nowN, soon };
}
