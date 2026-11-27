import { badgeText, buildBadges } from '../lib/badges';
import type { TodayItem } from '../lib/today';

const it = (id: string, count: number): TodayItem => ({ id, title: id, count, area: 'x', role: 'any' });

describe('badges', () => {
  test('counts go to the right tabs and rows, zero is left out', () => {
    const b = buildBadges([it('tasks', 2), it('low', 3), it('deliveries', 1), it('batches', 0), it('expiring', 4), it('orders', 5), it('owed', 7)], 1);
    expect(b.tabs).toEqual({ index: 2, buy: 4, make: 4, sell: 5, more: 1 });
    expect(b.rows).toEqual({ 'buy-low': 3, 'make-open-jars': 4, 'area-invoices': 7 });
  });
  test('nothing waiting means no dots', () => {
    expect(buildBadges([], 0)).toEqual({ tabs: {}, rows: {} });
  });
  test('big counts read 99+', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(150)).toBe('99+');
  });
});
