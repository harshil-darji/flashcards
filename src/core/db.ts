import type { IDBPDatabase } from 'idb';
import type { Card, Deck, ID, ReviewLog, Settings } from '../types';

export const DB_NAME = 'flashcards';
export const DB_VERSION = 1;

/** Object stores: decks (key id, index path), cards (key id, indexes deckId, due), logs (key id, indexes cardId, reviewedAt), settings (single key 'settings'). */
export type FlashcardsDB = IDBPDatabase<unknown>;

const todo = (name: string): never => {
  throw new Error(`TODO: db.${name} not implemented`);
};

export async function openDB(): Promise<FlashcardsDB> { return todo('openDB'); }

// Decks
export async function listDecks(): Promise<Deck[]> { return todo('listDecks'); }
export async function getDeck(id: ID): Promise<Deck | undefined> { return todo('getDeck'); }
export async function putDeck(deck: Deck): Promise<void> { return todo('putDeck'); }
/** Deletes deck, its sub-decks, and their cards/logs. */
export async function deleteDeck(id: ID): Promise<void> { return todo('deleteDeck'); }

// Cards
export async function listCards(deckId?: ID): Promise<Card[]> { return todo('listCards'); }
export async function getCard(id: ID): Promise<Card | undefined> { return todo('getCard'); }
export async function putCard(card: Card): Promise<void> { return todo('putCard'); }
export async function putCards(cards: Card[]): Promise<void> { return todo('putCards'); }
export async function deleteCard(id: ID): Promise<void> { return todo('deleteCard'); }

// Review logs
export async function addLog(log: ReviewLog): Promise<void> { return todo('addLog'); }
export async function listLogs(opts?: { cardId?: ID; since?: number; until?: number }): Promise<ReviewLog[]> { return todo('listLogs'); }

// Settings
export async function getSettings(): Promise<Settings> { return todo('getSettings'); }
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> { return todo('saveSettings'); }

/** Case-insensitive search over front/back/tags (and optional deck filter). */
export async function searchCards(query: string, opts?: { deckId?: ID; tags?: string[] }): Promise<Card[]> { return todo('searchCards'); }

/** Imports parsed cards: auto-creates decks by path, upserts by id. */
export async function importCards(result: import('./importExport').ParseResult): Promise<{ decksCreated: number; cardsAdded: number; cardsUpdated: number }> { return todo('importCards'); }
