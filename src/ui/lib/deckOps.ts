import type { Deck, ID } from '../../types';
import * as db from '../../core/db';
import { DECK_SEPARATOR, normalizeDeckPath, resolveDecks } from '../../core/importExport';

/** Ensures a deck (and its parents) exists for `path`; returns its id. */
export async function createDeckPath(path: string, existing: Deck[]): Promise<ID> {
  const norm = normalizeDeckPath(path);
  const { created, deckIdByPath } = resolveDecks([norm], existing);
  for (const d of created) await db.putDeck(d);
  return deckIdByPath.get(norm)!;
}

export function childPath(parent: Deck | null, name: string): string {
  return normalizeDeckPath(parent ? `${parent.path}${DECK_SEPARATOR}${name}` : name);
}

/** Renames a deck's leaf name and rewrites the paths of all its sub-decks. */
export async function renameDeck(deck: Deck, newName: string, decks: Deck[]): Promise<void> {
  const name = newName.split(DECK_SEPARATOR).join(' ').trim();
  const parent = deck.parentId ? decks.find((d) => d.id === deck.parentId) ?? null : null;
  const newPath = childPath(parent, name);
  if (newPath === deck.path) return;
  if (decks.some((d) => d.id !== deck.id && d.path === newPath)) throw new Error('A deck with that name already exists.');
  const now = Date.now();
  const oldPrefix = deck.path + DECK_SEPARATOR;
  await db.putDeck({ ...deck, name, path: newPath, updatedAt: now });
  for (const d of decks) {
    if (d.path.startsWith(oldPrefix)) {
      await db.putDeck({ ...d, path: newPath + DECK_SEPARATOR + d.path.slice(oldPrefix.length), updatedAt: now });
    }
  }
}
