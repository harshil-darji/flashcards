import { describe, expect, it } from 'vitest';
import { dueToday, reviewsPerDay, streak } from './stats';
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
