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

/** Renames or moves a deck (full `::` path) in one db transaction. */
export async function renameDeck(deck: Deck, newPath: string): Promise<void> {
  await db.renameDeck(deck.id, newPath);
}
