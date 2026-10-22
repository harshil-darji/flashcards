import { describe, expect, it } from 'vitest';
import { createEmptyCard, State } from 'ts-fsrs';
import type { Card, Deck } from '../../../types';
import { buildTree } from '../../lib/decks';
import { progressByDeck } from './deckProgress';

const deck = (id: string, parentId: string | null): Deck => ({ id, name: id, path: id, parentId, createdAt: 0, updatedAt: 0 });
const card = (deckId: string, done: boolean): Card => ({
  id: Math.random().toString(36), deckId, front: '', back: '', tags: [], createdAt: 0, updatedAt: 0,
  fsrs: { ...createEmptyCard(), ...(done ? { state: State.Review, stability: 40 } : {}) },
});

describe('progressByDeck', () => {
  it('aggregates over descendants', () => {
    const decks = [deck('root', null), deck('a', 'root'), deck('b', 'root'), deck('lone', null)];
    const cards = [card('root', false), card('a', true), card('a', false), card('b', true)];
    const m = progressByDeck(buildTree(decks, cards), cards);
    expect(m.get('root')).toMatchObject({ total: 4, mastered: 2, pct: 50 });
    expect(m.get('a')).toMatchObject({ total: 2, mastered: 1, pct: 50 });
    expect(m.get('b')).toMatchObject({ total: 1, mastered: 1, pct: 100 });
    expect(m.get('lone')).toMatchObject({ total: 0, pct: 0 });
  });
});
