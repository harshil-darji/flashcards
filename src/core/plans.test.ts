import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createEmptyCard, State } from 'ts-fsrs';
import type { Card, Deck } from '../types';
import { NEETCODE_150, planProgress } from './plans';

const NOW = new Date(2026, 9, 22, 12).getTime();
let n = 0;
const card = (tags: string[], fsrs: Partial<Card['fsrs']> = {}, deckId = 'd'): Card => ({
  id: `c${n++}`, deckId, front: 'f', back: 'b', tags, createdAt: 0, updatedAt: 0,
  fsrs: { ...createEmptyCard(new Date(NOW)), ...fsrs },
});
const mastered = { state: State.Review, stability: 30, due: new Date(NOW + 86400e3 * 10) };
const dueReview = { state: State.Review, stability: 3, due: new Date(NOW - 1000) };
const deck = (p: string): Deck => ({ id: 'id:' + p, name: p.split('::').pop()!, path: p, parentId: null, createdAt: 0, updatedAt: 0 });

describe('NeetCode 150 plan definition', () => {
  const seedDir = path.resolve(__dirname, '../seed');
  const seed = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8')).cards as { deck: string; tags: string[] }[]);
  const nc = seed.filter((c) => c.tags.includes('nc150'));

  it('has 18 categories in roadmap order', () => {
    expect(NEETCODE_150.categories.map((c) => c.name)).toEqual([
      'Arrays & Hashing', 'Two Pointers', 'Sliding Window', 'Stack', 'Binary Search', 'Linked List', 'Trees', 'Tries',
      'Heap / Priority Queue', 'Backtracking', 'Graphs', 'Advanced Graphs', '1-D Dynamic Programming', '2-D Dynamic Programming',
      'Greedy', 'Intervals', 'Math & Geometry', 'Bit Manipulation',
    ]);
  });
  it('matches the seed: 150 nc150 cards, each in exactly one category whose deck is the card deck', () => {
    expect(nc.length).toBe(NEETCODE_150.expected);
    for (const c of nc) {
      const hits = NEETCODE_150.categories.filter((cat) => c.tags.includes(cat.tag));
      expect(hits.length, c.tags.join(',')).toBe(1);
      expect(hits[0].deckPath).toBe(c.deck);
    }
  });
  it('every category is non-empty in the seed', () => {
    for (const cat of NEETCODE_150.categories) expect(nc.some((c) => c.tags.includes(cat.tag)), cat.name).toBe(true);
  });
});

describe('planProgress', () => {
  const decks = [deck('LeetCode::Two Pointers'), deck('LeetCode::Stack')];
  const cards = [
    card(['nc150', 'two-pointers'], mastered),
    card(['nc150', 'two-pointers'], dueReview),
    card(['nc150', 'two-pointers']),
    card(['pattern', 'two-pointers'], mastered), // pattern card in same deck: ignored
    card(['nc150', 'stack'], mastered),
  ];
  const s = planProgress(NEETCODE_150, cards, decks, NOW);
  it('overall counts only plan-tagged cards', () => {
    expect(s.overall).toMatchObject({ total: 4, mastered: 2, new: 1, young: 1, due: 1, pct: 50 });
  });
  it('per category progress + deck lookup', () => {
    const tp = s.categories.find((c) => c.category.tag === 'two-pointers')!;
    expect(tp).toMatchObject({ total: 3, mastered: 1, due: 1, new: 1, pct: 33, deckId: 'id:LeetCode::Two Pointers' });
    const st = s.categories.find((c) => c.category.tag === 'stack')!;
    expect(st).toMatchObject({ total: 1, mastered: 1, due: 0, pct: 100 });
  });
  it('missing deck -> null deckId, empty category -> zeros', () => {
    const g = s.categories.find((c) => c.category.tag === 'graphs')!;
    expect(g).toMatchObject({ total: 0, mastered: 0, pct: 0, due: 0, deckId: null });
  });
  it('empty input', () => {
    expect(planProgress(NEETCODE_150, [], [], NOW).overall).toMatchObject({ total: 0, pct: 0, due: 0 });
  });
});
