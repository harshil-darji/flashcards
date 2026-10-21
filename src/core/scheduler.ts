import type { Card, FsrsState, ID, Rating, ReviewLog, Settings } from '../types';

const todo = (name: string): never => {
  throw new Error(`TODO: scheduler.${name} not implemented`);
};

/** Fresh FSRS state for a new card (wraps ts-fsrs createEmptyCard). */
export function newFsrsState(now: Date = new Date()): FsrsState { return todo('newFsrsState'); }

/** Applies a rating; pure — caller persists the returned card and log. */
export function review(card: Card, rating: Rating, now: Date = new Date(), settings?: Partial<Settings>): { card: Card; log: ReviewLog } { return todo('review'); }

/** Cards due at `now` (optionally limited to a deck and its sub-decks), ordered by due ascending. */
export async function dueCards(deckId?: ID, now: Date = new Date()): Promise<Card[]> { return todo('dueCards'); }

/** Next due date for each rating, for button labels like "10m / 1d / 3d / 8d". */
export function previewIntervals(card: Card, now: Date = new Date(), settings?: Partial<Settings>): Record<Rating, { due: Date; label: string }> { return todo('previewIntervals'); }
