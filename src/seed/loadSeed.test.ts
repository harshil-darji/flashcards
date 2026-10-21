import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../core/db';
import { addLog } from '../core/db';
import { parseSeeds, loadSeed, seedCardId, seedCardsWithIds } from './loadSeed';
import type { ReviewLog } from '../types';

const file = (cards: { front: string; back: string; deck: string; tags?: string[]; id?: string }[]) => JSON.stringify({ version: 1, cards });
const v1 = file([
  { front: 'Q1', back: 'A1', deck: 'LeetCode::Two Pointers' },
  { front: 'Q2', back: 'A2', deck: 'LeetCode::Two Pointers' },
]);

beforeEach(async () => {
  const d = await db.openDB();
  for (const s of ['decks', 'cards', 'logs', 'settings']) await d.clear(s);
});

describe('parseSeeds', () => {
  it('parses each seed file in name order', () => {
    const out = parseSeeds({
      './b.json': '[{"front":"q","back":"a","deck":"B"}]',
      './a.json': '{"version":1,"cards":[{"front":"q","back":"a","deck":"LeetCode::Two Pointers","tags":["x"]}]}',
    });
    expect(out.map((o) => o.file)).toEqual(['./a.json', './b.json']);
    expect(out[0].result.cards[0].deck).toBe('LeetCode::Two Pointers');
    expect(out.every((o) => o.result.errors.length === 0)).toBe(true);
  });
  it('real seed files (if any) parse without errors', () => {
    for (const { file, result } of parseSeeds()) expect(result.errors, file).toEqual([]);
  });
  it('real seed card ids are unique across all files', () => {
    const all = parseSeeds().flatMap(({ result }) => seedCardsWithIds(result.cards).map((c) => c.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('seed ids', () => {
  it('are stable per deck+front, explicit ids win, duplicates get a suffix', () => {
    expect(seedCardId('LeetCode :: X', ' Q ')).toBe(seedCardId('LeetCode::X', 'Q'));
    const ids = seedCardsWithIds([
      { front: 'Q', back: '', deck: 'D', tags: [] },
      { front: 'Q', back: '', deck: 'D', tags: [] },
      { id: 'mine', front: 'Z', back: '', deck: 'D', tags: [] },
    ]).map((c) => c.id);
    expect(ids[1]).toBe(`${ids[0]}-2`);
    expect(ids[2]).toBe('mine');
  });
});

describe('loadSeed (versioned)', () => {
  it('imports once; unchanged files are skipped on later startups', async () => {
    expect(await loadSeed({ './a.json': v1 })).toBe(2);
    expect(await loadSeed({ './a.json': v1 })).toBe(0);
    expect((await db.listCards()).length).toBe(2);
    const s = await db.getSettings();
    expect(s.seeded).toBe(true);
    expect(Object.keys(s.seedVersions!)).toEqual(['./a.json']);
  });

  it('a newly added seed file imports for existing users', async () => {
    await loadSeed({ './a.json': v1 });
    expect(await loadSeed({ './a.json': v1, './b.json': file([{ front: 'B1', back: 'x', deck: 'System Design' }]) })).toBe(1);
    expect((await db.listCards()).length).toBe(3);
    expect((await db.listDecks()).map((d) => d.path)).toContain('System Design');
  });

  it('an updated file upserts by id, keeps review state, respects user edits and deletions', async () => {
    await loadSeed({ './a.json': v1 });
    const [c1, c2] = (await db.listCards()).sort((a, b) => a.front.localeCompare(b.front));
    const reviewed = { ...c1, fsrs: { ...c1.fsrs, reps: 4, stability: 9 }, updatedAt: c1.updatedAt + 1 };
    await db.putCard(reviewed);
    await db.putCard({ ...c2, back: 'my own notes' }); // user edit
    const v2 = file([
      { front: 'Q1', back: 'A1 improved', deck: 'LeetCode::Two Pointers', tags: ['new'] },
      { front: 'Q2', back: 'A2 improved', deck: 'LeetCode::Two Pointers' },
      { front: 'Q3', back: 'A3', deck: 'LeetCode::Two Pointers' },
    ]);
    expect(await loadSeed({ './a.json': v2 })).toBe(1);
    const after = new Map((await db.listCards()).map((c) => [c.front, c]));
    expect(after.get('Q1')).toMatchObject({ id: c1.id, back: 'A1 improved', tags: ['new'], createdAt: c1.createdAt });
    expect(after.get('Q1')!.fsrs).toMatchObject({ reps: 4, stability: 9 });
    expect(after.get('Q2')!.back).toBe('my own notes');
    expect(after.has('Q3')).toBe(true);

    // User deletes Q3; a later file version doesn't resurrect it.
    await db.deleteCard(after.get('Q3')!.id);
    await loadSeed({ './a.json': v2.replace('A1 improved', 'A1 v3') });
    expect((await db.listCards()).map((c) => c.front).sort()).toEqual(['Q1', 'Q2']);
  });

  it('migrates pre-versioning installs: re-keys old random-id seed cards (with logs) instead of duplicating', async () => {
    await db.importCards({ cards: [{ front: 'Q1', back: 'A1', deck: 'LeetCode::Two Pointers', tags: [] }], errors: [] });
    const [old] = await db.listCards();
    await addLog({ id: 'l1', cardId: old.id, deckId: old.deckId, rating: 3, reviewedAt: 1 } as ReviewLog);
    await db.saveSettings({ seeded: true });
    expect(await loadSeed({ './a.json': v1 })).toBe(1); // only Q2 is new
    const cards = await db.listCards();
    expect(cards.length).toBe(2);
    const q1 = cards.find((c) => c.front === 'Q1')!;
    expect(q1.id).toBe(seedCardId('LeetCode::Two Pointers', 'Q1'));
    expect((await db.listLogs())[0].cardId).toBe(q1.id);
  });
});
