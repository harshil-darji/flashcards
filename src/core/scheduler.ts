import { createEmptyCard, fsrs, generatorParameters, type Grade } from 'ts-fsrs';
import type { Card, FsrsState, ID, ReviewLog, Settings } from '../types';
import { DEFAULT_SETTINGS, Rating } from '../types';
import { deckAndDescendantIds, listCards } from './db';

function engine(settings?: Partial<Settings>) {
  const s = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  return fsrs(generatorParameters({ request_retention: s.requestRetention, maximum_interval: s.maximumInterval, enable_fuzz: s.enableFuzz }));
}

/** Fresh FSRS state for a new card (wraps ts-fsrs createEmptyCard). */
export function newFsrsState(now: Date = new Date()): FsrsState { return createEmptyCard(now); }

/** Applies a rating; pure — caller persists the returned card and log. */
export function review(card: Card, rating: Rating, now: Date = new Date(), settings?: Partial<Settings>): { card: Card; log: ReviewLog } {
  const res = engine(settings).next(card.fsrs, now, rating as unknown as Grade);
  const t = now.getTime();
  return {
    card: { ...card, fsrs: res.card, updatedAt: t },
    log: { id: crypto.randomUUID(), cardId: card.id, deckId: card.deckId, rating, reviewedAt: t, fsrs: res.log },
  };
}

/** Cards due at `now` (optionally limited to a deck and its sub-decks), ordered by due ascending. */
export async function dueCards(deckId?: ID, now: Date = new Date()): Promise<Card[]> {
  let cards = await listCards();
  if (deckId !== undefined) {
    const ids = await deckAndDescendantIds(deckId);
    cards = cards.filter((c) => ids.has(c.deckId));
  }
  const t = now.getTime();
  return cards.filter((c) => new Date(c.fsrs.due).getTime() <= t).sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());
}

export function formatInterval(ms: number): string {
  const m = ms / 60000;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  const y = d / 365;
  return `${y < 10 ? Math.round(y * 10) / 10 : Math.round(y)}y`;
}

/** Next due date for each rating, for button labels like "10m / 1d / 3d / 8d". */
export function previewIntervals(card: Card, now: Date = new Date(), settings?: Partial<Settings>): Record<Rating, { due: Date; label: string }> {
  const e = engine(settings);
  const out = {} as Record<Rating, { due: Date; label: string }>;
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const due = new Date(e.next(card.fsrs, now, r as unknown as Grade).card.due);
    out[r] = { due, label: formatInterval(due.getTime() - now.getTime()) };
  }
  return out;
}
