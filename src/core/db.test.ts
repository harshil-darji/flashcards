import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from './db';
import { newFsrsState } from './scheduler';
import type { Card, Deck } from '../types';

const deck = (id: string, path: string, parentId: string | null): Deck => ({ id, name: path.split('::').pop()!, path, parentId, createdAt: 0, updatedAt: 0 });
const card = (id: string, deckId: string, front = 'f', tags: string[] = []): Card => ({ id, deckId, front, back: 'b', tags, createdAt: 0, updatedAt: 0, fsrs: newFsrsState(new Date(0)) });

beforeEach(async () => {
  const d = await db.openDB();
  for (const s of ['decks', 'cards', 'logs', 'settings']) await d.clear(s);
});

describe('db', () => {
  it('settings merge with defaults', async () => {
    expect((await db.getSettings()).dayStartHour).toBe(4);
    const s = await db.saveSettings({ theme: 'dark' });
    expect(s.theme).toBe('dark');
    expect((await db.getSettings()).theme).toBe('dark');
    expect((await db.getSettings()).requestRetention).toBe(0.9);
  });
  it('deck path is unique', async () => {
    await db.putDeck(deck('a', 'A', null));
    await expect(db.putDeck(deck('b', 'A', null))).rejects.toBeTruthy();
  });
  it('deleteDeck cascades', async () => {
    await db.putDeck(deck('a', 'A', null));
    await db.putDeck(deck('b', 'A::B', 'a'));
    await db.putDeck(deck('c', 'C', null));
    await db.putCards([card('1', 'a'), card('2', 'b'), card('3', 'c')]);
    await db.addLog({ id: 'l1', cardId: '2', deckId: 'b', rating: 3, reviewedAt: 5, fsrs: {} as never });
    await db.deleteDeck('a');
    expect((await db.listDecks()).map((d) => d.id)).toEqual(['c']);
    expect((await db.listCards()).map((c) => c.id)).toEqual(['3']);
    expect(await db.listLogs()).toEqual([]);
  });
  it('cards and logs CRUD', async () => {
    await db.putCard(card('1', 'a'));
    expect((await db.getCard('1'))?.fsrs.due).toBeInstanceOf(Date);
    expect(await db.listCards('a')).toHaveLength(1);
    await db.addLog({ id: 'l1', cardId: '1', deckId: 'a', rating: 3, reviewedAt: 10, fsrs: {} as never });
    await db.addLog({ id: 'l2', cardId: '1', deckId: 'a', rating: 3, reviewedAt: 20, fsrs: {} as never });
    expect((await db.listLogs({ since: 15 })).map((l) => l.id)).toEqual(['l2']);
    expect(await db.listLogs({ cardId: '1', until: 15 })).toHaveLength(1);
    await db.deleteCard('1');
    expect(await db.getCard('1')).toBeUndefined();
    expect(await db.listLogs()).toEqual([]);
  });
  it('searchCards filters', async () => {
    await db.putDeck(deck('a', 'A', null));
    await db.putDeck(deck('b', 'A::B', 'a'));
    await db.putCards([card('1', 'b', 'Two POINTERS', ['array']), card('2', 'x', 'heap', ['Pointers'])]);
    expect((await db.searchCards('pointers')).length).toBe(2);
    expect((await db.searchCards('pointers', { deckId: 'a' })).map((c) => c.id)).toEqual(['1']);
    expect((await db.searchCards('', { tags: ['array'] })).map((c) => c.id)).toEqual(['1']);
  });
  it('importCards creates decks and upserts', async () => {
    const r1 = await db.importCards({ cards: [{ id: 'x', front: 'q', back: 'a', deck: 'L::T', tags: [] }, { front: 'q2', back: 'a', deck: 'L', tags: [] }], errors: [] });
    expect(r1).toEqual({ decksCreated: 2, cardsAdded: 2, cardsUpdated: 0 });
    const r2 = await db.importCards({ cards: [{ id: 'x', front: 'new', back: 'a', deck: 'L::T', tags: [] }], errors: [] });
    expect(r2).toEqual({ decksCreated: 0, cardsAdded: 0, cardsUpdated: 1 });
    expect((await db.getCard('x'))?.front).toBe('new');
  });
});
