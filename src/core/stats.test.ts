import { describe, expect, it } from 'vitest';
import { dueToday, forecast, heatmap, longestStreak, retention, reviewsPerDay, streak } from './stats';
import type { Card, ReviewLog } from '../types';

const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h).getTime();
const log = (t: number) => ({ id: String(t), cardId: 'c', deckId: 'd', rating: 3, reviewedAt: t, fsrs: {} }) as unknown as ReviewLog;
const cardDue = (t: number) => ({ fsrs: { due: new Date(t) } }) as unknown as Card;

describe('stats', () => {
  const now = new Date(at(2026, 3, 10, 12));
  it('streak including today', () => {
    expect(streak([log(at(2026, 3, 10, 9)), log(at(2026, 3, 9, 9)), log(at(2026, 3, 8, 23))], now)).toBe(3);
  });
  it('streak from yesterday when none today', () => {
    expect(streak([log(at(2026, 3, 9, 9)), log(at(2026, 3, 8, 9)), log(at(2026, 3, 6, 9))], now)).toBe(2);
    expect(streak([log(at(2026, 3, 7, 9))], now)).toBe(0);
  });
  it('dayStartHour shifts boundaries', () => {
    // 2am on the 10th counts as the 9th's study day
    expect(streak([log(at(2026, 3, 10, 2)), log(at(2026, 3, 8, 9))], now)).toBe(2);
    expect(streak([log(at(2026, 3, 10, 2))], new Date(at(2026, 3, 10, 3)))).toBe(1);
  });
  it('dueToday counts until next day start', () => {
    expect(dueToday([cardDue(at(2026, 3, 1, 0)), cardDue(at(2026, 3, 11, 3)), cardDue(at(2026, 3, 11, 5))], now)).toBe(2);
  });
  it('reviewsPerDay', () => {
    const r = reviewsPerDay([log(at(2026, 3, 10, 9)), log(at(2026, 3, 10, 2)), log(at(2026, 3, 9, 9))], 3, now);
    expect(r).toEqual([{ date: '2026-03-08', count: 0 }, { date: '2026-03-09', count: 2 }, { date: '2026-03-10', count: 1 }]);
  });
});

const logR = (t: number, rating: number) => ({ ...log(t), rating }) as unknown as ReviewLog;
const card = (due: number, state: number) => ({ fsrs: { due: new Date(due), state } }) as unknown as Card;

describe('forecast', () => {
  const now = new Date(at(2026, 3, 10, 12));
  it('buckets by study day, overdue into today, skips New and out-of-range', () => {
    const f = forecast([
      card(at(2026, 2, 1, 0), 2), // overdue -> today
      card(at(2026, 3, 11, 3), 2), // before 4am on the 11th -> today
      card(at(2026, 3, 11, 5), 1), // tomorrow
      card(at(2026, 3, 12, 9), 3), // day 2
      card(at(2026, 3, 13, 9), 2), // beyond 3-day window
      card(at(2026, 3, 1, 0), 0), // New: excluded
    ], 3, now);
    expect(f).toEqual([{ date: '2026-03-10', count: 2 }, { date: '2026-03-11', count: 1 }, { date: '2026-03-12', count: 1 }]);
  });
  it('defaults to 30 days starting today', () => {
    const f = forecast([], undefined, now);
    expect(f).toHaveLength(30);
    expect(f[0].date).toBe('2026-03-10');
    expect(f[29].date).toBe('2026-04-08');
  });
  it('before dayStartHour today is still the previous study day', () => {
    expect(forecast([card(at(2026, 3, 10, 3), 2)], 1, new Date(at(2026, 3, 10, 2)))).toEqual([{ date: '2026-03-09', count: 1 }]);
  });
});

describe('heatmap', () => {
  const now = new Date(at(2026, 3, 10, 12)); // Tuesday
  it('lays out Sunday-start weeks ending with the current week', () => {
    const h = heatmap([], 16, now);
    expect(h.weeks).toHaveLength(16);
    expect(h.weeks.every((w) => w.length === 7)).toBe(true);
    expect(h.weeks[15][0].date).toBe('2026-03-08'); // Sunday of this week
    expect(h.weeks[15][2]).toMatchObject({ date: '2026-03-10', future: false });
    expect(h.weeks[15][3].future).toBe(true);
    expect(h.weeks[0][0].date).toBe('2025-11-23');
    expect(h.max).toBe(0);
    expect(h.weeks.flat().every((c) => c.level === 0)).toBe(true);
  });
  it('counts and levels per study day', () => {
    const logs = [
      ...Array.from({ length: 8 }, () => log(at(2026, 3, 10, 9))),
      log(at(2026, 3, 10, 2)), log(at(2026, 3, 9, 9)), log(at(2026, 3, 9, 10)), // 2am on the 10th -> 9th
      log(at(2025, 1, 1, 9)), // outside window
    ];
    const h = heatmap(logs, 2, now);
    const cell = (d: string) => h.weeks.flat().find((c) => c.date === d)!;
    expect(cell('2026-03-10')).toMatchObject({ count: 8, level: 4 });
    expect(cell('2026-03-09')).toMatchObject({ count: 3, level: 2 });
    expect(cell('2026-03-08')).toMatchObject({ count: 0, level: 0 });
    expect(h.max).toBe(8);
    expect(h.total).toBe(11);
  });
});

describe('longestStreak', () => {
  it('finds the longest run anywhere in history', () => {
    const logs = [at(2026, 1, 30, 9), at(2026, 1, 31, 9), at(2026, 2, 1, 9), at(2026, 2, 2, 9), at(2026, 2, 5, 9), at(2026, 2, 6, 9), at(2026, 2, 6, 20)].map(log);
    expect(longestStreak(logs)).toBe(4);
    expect(longestStreak([])).toBe(0);
    expect(longestStreak([log(at(2026, 3, 1, 9))])).toBe(1);
  });
  it('respects dayStartHour', () => {
    // 2am on the 3rd belongs to the 2nd: 1st, 2nd, (2nd) -> 2
    expect(longestStreak([log(at(2026, 3, 1, 9)), log(at(2026, 3, 2, 9)), log(at(2026, 3, 3, 2))])).toBe(2);
    expect(longestStreak([log(at(2026, 3, 1, 9)), log(at(2026, 3, 3, 2))])).toBe(2);
  });
  it('spans DST changes', () => {
    const logs = [at(2026, 3, 7, 9), at(2026, 3, 8, 9), at(2026, 3, 9, 9), at(2026, 11, 1, 9), at(2026, 11, 2, 9)].map(log);
    expect(longestStreak(logs)).toBe(3);
  });
});

describe('retention', () => {
  const now = new Date(at(2026, 3, 10, 12));
  it('counts non-Again share over study days', () => {
    const logs = [logR(at(2026, 3, 10, 9), 3), logR(at(2026, 3, 10, 10), 1), logR(at(2026, 3, 10, 2), 4), logR(at(2026, 3, 1, 9), 1), logR(at(2026, 1, 1, 9), 1)];
    expect(retention(logs, 1, now)).toEqual({ total: 2, correct: 1, pct: 50 });
    expect(retention(logs, 2, now)).toEqual({ total: 3, correct: 2, pct: 67 });
    expect(retention(logs, 30, now)).toEqual({ total: 4, correct: 2, pct: 50 });
  });
  it('null pct when nothing reviewed', () => {
    expect(retention([], 30, now)).toEqual({ total: 0, correct: 0, pct: null });
  });
});
