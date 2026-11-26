import { daysUntilStart, inSeason, seasonCounts, seasonFromLine, seasonToLine, validDay } from '../lib/season';

describe('seasons', () => {
  test('days are checked', () => {
    expect(validDay('09-15')).toBe(true);
    expect(validDay('02-29')).toBe(true);
    expect(validDay('13-01')).toBe(false);
    expect(validDay('9-15')).toBe(false);
    expect(validDay('04-31')).toBe(false);
  });

  test('line round trip, and bad lines are ignored', () => {
    const s = { start: '09-15', end: '11-30' };
    expect(seasonFromLine(seasonToLine(s))).toEqual(s);
    expect(seasonFromLine('nope')).toBeNull();
    expect(seasonFromLine(undefined)).toBeNull();
  });

  test('in season, including across New Year', () => {
    const fall = { start: '09-15', end: '11-30' };
    expect(inSeason(fall, new Date(2026, 9, 1))).toBe(true);
    expect(inSeason(fall, new Date(2026, 5, 1))).toBe(false);
    const winter = { start: '11-15', end: '01-05' };
    expect(inSeason(winter, new Date(2026, 11, 25))).toBe(true);
    expect(inSeason(winter, new Date(2027, 0, 3))).toBe(true);
    expect(inSeason(winter, new Date(2027, 2, 3))).toBe(false);
  });

  test('days until start', () => {
    const fall = { start: '09-15', end: '11-30' };
    expect(daysUntilStart(fall, new Date(2026, 9, 1))).toBe(0);
    expect(daysUntilStart(fall, new Date(2026, 8, 1))).toBe(14);
    expect(daysUntilStart(fall, new Date(2026, 11, 1))).toBeGreaterThan(200);
  });

  test('counts now and soon', () => {
    const settings = { 'season.1': '09-15|11-30', 'season.2': '10-10|12-01', 'season.3': 'bad', other: 'x' };
    expect(seasonCounts(settings, 14, new Date(2026, 9, 1))).toEqual({ now: 1, soon: 1 });
  });
});
