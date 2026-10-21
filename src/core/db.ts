import { openDB as idbOpen, type IDBPDatabase } from 'idb';
import type { Card, Deck, ID, ReviewLog, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { materialize } from './importExport';

export const DB_NAME = 'flashcards';
export const DB_VERSION = 1;

/** Object stores: decks (key id, index path), cards (key id, indexes deckId, due), logs (key id, indexes cardId, reviewedAt), settings (single key 'settings'). */
export type FlashcardsDB = IDBPDatabase<unknown>;

const SETTINGS_KEY = 'settings';
let dbPromise: Promise<FlashcardsDB> | null = null;

export async function openDB(): Promise<FlashcardsDB> {
  if (!dbPromise) {
    dbPromise = idbOpen(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('decks')) {
          const s = db.createObjectStore('decks', { keyPath: 'id' });
          s.createIndex('path', 'path', { unique: true });
          s.createIndex('parentId', 'parentId');
        }
        if (!db.objectStoreNames.contains('cards')) {
          const s = db.createObjectStore('cards', { keyPath: 'id' });
          s.createIndex('deckId', 'deckId');
          s.createIndex('due', 'fsrs.due');
        }
        if (!db.objectStoreNames.contains('logs')) {
          const s = db.createObjectStore('logs', { keyPath: 'id' });
          s.createIndex('cardId', 'cardId');
          s.createIndex('reviewedAt', 'reviewedAt');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      },
      blocking() {
        dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Ids of `id` and all its descendant decks. */
function subtreeIds(decks: Deck[], id: ID): Set<ID> {
  const ids = new Set<ID>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of decks) if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) { ids.add(d.id); grew = true; }
  }
  return ids;
}

/** Deck id plus sub-deck ids (exported for scheduler; not part of the public contract). */
export async function deckAndDescendantIds(id: ID): Promise<Set<ID>> {
  return subtreeIds(await listDecks(), id);
}

// Decks
export async function listDecks(): Promise<Deck[]> {
  const decks = (await (await openDB()).getAll('decks')) as Deck[];
  return decks.sort((a, b) => a.path.localeCompare(b.path));
}
export async function getDeck(id: ID): Promise<Deck | undefined> { return (await openDB()).get('decks', id) as Promise<Deck | undefined>; }
export async function putDeck(deck: Deck): Promise<void> { await (await openDB()).put('decks', deck); }
/** Deletes deck, its sub-decks, and their cards/logs. */
export async function deleteDeck(id: ID): Promise<void> {
  const db = await openDB();
  const ids = subtreeIds((await db.getAll('decks')) as Deck[], id);
  const tx = db.transaction(['decks', 'cards', 'logs'], 'readwrite');
  const cards = tx.objectStore('cards');
  const logs = tx.objectStore('logs');
  for (const deckId of ids) {
    for (const cardId of await cards.index('deckId').getAllKeys(deckId)) {
      for (const logId of await logs.index('cardId').getAllKeys(cardId as ID)) await logs.delete(logId);
      await cards.delete(cardId);
    }
    await tx.objectStore('decks').delete(deckId);
  }
  await tx.done;
}

// Cards
export async function listCards(deckId?: ID): Promise<Card[]> {
  const db = await openDB();
  return (deckId === undefined ? db.getAll('cards') : db.getAllFromIndex('cards', 'deckId', deckId)) as Promise<Card[]>;
}
export async function getCard(id: ID): Promise<Card | undefined> { return (await openDB()).get('cards', id) as Promise<Card | undefined>; }
export async function putCard(card: Card): Promise<void> { await (await openDB()).put('cards', card); }
export async function putCards(cards: Card[]): Promise<void> {
  const tx = (await openDB()).transaction('cards', 'readwrite');
  await Promise.all([...cards.map((c) => tx.store.put(c)), tx.done]);
}
export async function deleteCard(id: ID): Promise<void> {
  const tx = (await openDB()).transaction(['cards', 'logs'], 'readwrite');
  const logs = tx.objectStore('logs');
  for (const k of await logs.index('cardId').getAllKeys(id)) await logs.delete(k);
  await tx.objectStore('cards').delete(id);
  await tx.done;
}

// Review logs
export async function addLog(log: ReviewLog): Promise<void> { await (await openDB()).put('logs', log); }
export async function listLogs(opts: { cardId?: ID; since?: number; until?: number } = {}): Promise<ReviewLog[]> {
  const db = await openDB();
  let logs: ReviewLog[];
  if (opts.cardId !== undefined) logs = (await db.getAllFromIndex('logs', 'cardId', opts.cardId)) as ReviewLog[];
  else {
    const range = opts.since !== undefined && opts.until !== undefined ? IDBKeyRange.bound(opts.since, opts.until)
      : opts.since !== undefined ? IDBKeyRange.lowerBound(opts.since)
      : opts.until !== undefined ? IDBKeyRange.upperBound(opts.until) : undefined;
    logs = (await db.getAllFromIndex('logs', 'reviewedAt', range)) as ReviewLog[];
  }
  return logs
    .filter((l) => (opts.since === undefined || l.reviewedAt >= opts.since) && (opts.until === undefined || l.reviewedAt <= opts.until))
    .sort((a, b) => a.reviewedAt - b.reviewedAt);
}

// Settings
export async function getSettings(): Promise<Settings> {
  const s = (await (await openDB()).get('settings', SETTINGS_KEY)) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await (await openDB()).put('settings', next, SETTINGS_KEY);
  return next;
}

/** Case-insensitive search over front/back/tags (and optional deck filter). */
export async function searchCards(query: string, opts: { deckId?: ID; tags?: string[] } = {}): Promise<Card[]> {
  const q = query.trim().toLowerCase();
  let cards = await listCards();
  if (opts.deckId !== undefined) {
    const ids = await deckAndDescendantIds(opts.deckId);
    cards = cards.filter((c) => ids.has(c.deckId));
  }
  if (opts.tags?.length) {
    const want = opts.tags.map((t) => t.toLowerCase());
    cards = cards.filter((c) => want.every((t) => c.tags.some((x) => x.toLowerCase() === t)));
  }
  if (q) cards = cards.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)));
  return cards.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Imports parsed cards: auto-creates decks by path, upserts by id. */
export async function importCards(result: import('./importExport').ParseResult): Promise<{ decksCreated: number; cardsAdded: number; cardsUpdated: number }> {
  const db = await openDB();
  const { decks, cards } = materialize(result, (await db.getAll('decks')) as Deck[]);
  const tx = db.transaction(['decks', 'cards'], 'readwrite');
  for (const d of decks) await tx.objectStore('decks').put(d);
  let cardsAdded = 0, cardsUpdated = 0;
  const store = tx.objectStore('cards');
  for (const c of cards) {
    const prev = (await store.get(c.id)) as Card | undefined;
    if (prev) { cardsUpdated++; await store.put({ ...c, createdAt: prev.createdAt }); }
    else { cardsAdded++; await store.put(c); }
  }
  await tx.done;
  return { decksCreated: decks.length, cardsAdded, cardsUpdated };
}
