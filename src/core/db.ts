import { openDB as idbOpen, type IDBPDatabase } from 'idb';
import type { Card, Deck, ID, ReviewLog, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { DECK_SEPARATOR, materialize, normalizeDeckPath, resolveDecks } from './importExport';

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

/**
 * Renames/moves a deck to `newPath` (e.g. "LeetCode::Graphs::BFS") in a single transaction:
 * rewrites the paths of all sub-decks, re-parents the deck, and auto-creates missing ancestor decks.
 * Rejects if the deck doesn't exist, the path is taken, or the deck would move under itself.
 */
export async function renameDeck(id: ID, newPath: string): Promise<Deck> {
  const path = normalizeDeckPath(newPath);
  const db = await openDB();
  const tx = db.transaction('decks', 'readwrite');
  const store = tx.objectStore('decks');
  try {
    const all = (await store.getAll()) as Deck[];
    const deck = all.find((d) => d.id === id);
    if (!deck) throw new Error('Deck not found.');
    if (path === deck.path) { await tx.done; return deck; }
    const oldPrefix = deck.path + DECK_SEPARATOR;
    if (path.startsWith(oldPrefix)) throw new Error('A deck can’t be moved inside itself.');
    const subtree = all.filter((d) => d.path.startsWith(oldPrefix));
    const moving = new Set([deck.id, ...subtree.map((d) => d.id)]);
    const others = all.filter((d) => !moving.has(d.id));
    if (others.some((d) => d.path === path)) throw new Error('A deck with that name already exists.');
    const now = Date.now();
    const parts = path.split(DECK_SEPARATOR);
    let parentId: ID | null = null;
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join(DECK_SEPARATOR);
      const { created, deckIdByPath } = resolveDecks([parentPath], others, now);
      for (const d of created) await store.put(d);
      parentId = deckIdByPath.get(parentPath)!;
    }
    const renamed: Deck = { ...deck, name: parts[parts.length - 1], path, parentId, updatedAt: now };
    // Delete-then-put avoids transient unique-index collisions on `path` (e.g. swapping names).
    for (const d of [deck, ...subtree]) await store.delete(d.id);
    await store.put(renamed);
    for (const d of subtree) await store.put({ ...d, path: path + DECK_SEPARATOR + d.path.slice(oldPrefix.length), updatedAt: now });
    await tx.done;
    return renamed;
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    await tx.done.catch(() => {});
    throw e;
  }
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
