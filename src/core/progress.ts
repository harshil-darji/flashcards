import { State } from 'ts-fsrs';
import type { Card } from '../types';

/** A card is mastered once it is in Review state with stability of at least this many days. */
export const MASTERED_STABILITY_DAYS = 21;

export type Progress = { total: number; new: number; learning: number; young: number; mastered: number; pct: number };

export function isMastered(c: Card): boolean {
  return c.fsrs.state === State.Review && c.fsrs.stability >= MASTERED_STABILITY_DAYS;
}

/** Bucket cards by learning progress. pct = mastered / total, 0..100 (0 for an empty set). */
export function progressOf(cards: Card[]): Progress {
  const p: Progress = { total: cards.length, new: 0, learning: 0, young: 0, mastered: 0, pct: 0 };
  for (const c of cards) {
    if (c.fsrs.state === State.New) p.new++;
    else if (c.fsrs.state === State.Review) (isMastered(c) ? p.mastered++ : p.young++);
    else p.learning++;
  }
  p.pct = p.total ? Math.round((p.mastered / p.total) * 100) : 0;
  return p;
}
