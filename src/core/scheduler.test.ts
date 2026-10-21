import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from './db';
import { dueCards, formatInterval, newFsrsState, previewIntervals, review } from './scheduler';
import { Rating, type Card } from '../types';

const now = new Date('2026-01-01T12:00:00Z');
const card = (id: string, deckId: string, due = now): Card => ({ id, deckId, front: 'f', back: 'b', tags: [], createdAt: 0, updatedAt: 0, fsrs: { ...newFsrsState(now), due } });

beforeEach(async () => {
  const d = await db.openDB();
  for (const s of ['decks', 'cards', 'logs']) await d.clear(s);
});

describe('scheduler', () => {
  it('review is pure and advances', () => {
    const c = card('1', 'a');
    const snap = JSON.stringify(c);
    const { card: next, log } = review(c, Rating.Good, now, { enableFuzz: false });
    expect(JSON.stringify(c)).toBe(snap);
    expect(next.fsrs.reps).toBe(1);
    expect(next.fsrs.due.getTime()).toBeGreaterThan(now.getTime());
    expect(log).toMatchObject({ cardId: '1', deckId: 'a', rating: 3, reviewedAt: now.getTime() });
  });
  it('previewIntervals ordered with labels', () => {
    const p = previewIntervals(card('1', 'a'), now, { enableFuzz: false });
    const ds = [1, 2, 3, 4].map((r) => p[r as Rating].due.getTime());
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    for (const r of [1, 2, 3, 4] as Rating[]) expect(p[r].label).toMatch(/^(<1m|\d+(m|h|d|mo)|[\d.]+y)$/);
  });
  it('formatInterval', () => {
    expect(formatInterval(30e3)).toBe('<1m');
    expect(formatInterval(10 * 60e3)).toBe('10m');
    expect(formatInterval(86400e3)).toBe('1d');
    expect(formatInterval(4 * 86400e3)).toBe('4d');
    expect(formatInterval(60 * 86400e3)).toBe('2mo');
  });
  it('dueCards includes sub-decks, sorted', async () => {
    await db.putDeck({ id: 'a', name: 'A', path: 'A', parentId: null, createdAt: 0, updatedAt: 0 });
    await db.putDeck({ id: 'b', name: 'B', path: 'A::B', parentId: 'a', createdAt: 0, updatedAt: 0 });
    await db.putCards([
      card('late', 'a', new Date(now.getTime() - 1000)),
      card('early', 'b', new Date(now.getTime() - 5000)),
      card('future', 'a', new Date(now.getTime() + 1e6)),
      card('other', 'z', new Date(0)),
    ]);
    expect((await dueCards('a', now)).map((c) => c.id)).toEqual(['early', 'late']);
    expect((await dueCards(undefined, now)).map((c) => c.id)).toEqual(['other', 'early', 'late']);
  });
});
