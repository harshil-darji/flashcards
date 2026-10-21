import { describe, expect, it } from 'vitest';
import { createEmptyCard, State } from 'ts-fsrs';
import {
  exportCSV,
  exportJSON,
  materialize,
  normalizeDeckPath,
  parseCSV,
  parseCSVRows,
  parseJSON,
  parseTags,
  resolveDecks,
} from './importExport';
import type { Card, Deck } from '../types';

let n = 0;
const gen = () => `id${++n}`;
const NOW = Date.UTC(2026, 9, 21);

function deck(id: string, path: string, parentId: string | null = null): Deck {
  return { id, name: path.split('::').pop()!, path, parentId, createdAt: NOW, updatedAt: NOW };
}
function card(p: Partial<Card> & { deckId: string }): Card {
  return {
    id: 'c1', front: 'F', back: 'B', tags: [], createdAt: NOW, updatedAt: NOW,
    fsrs: createEmptyCard(new Date(NOW)), ...p,
  };
}

describe('helpers', () => {
  it('normalizes deck paths', () => {
    expect(normalizeDeckPath(' LeetCode :: Two Pointers ')).toBe('LeetCode::Two Pointers');
    expect(normalizeDeckPath('A::::B::')).toBe('A::B');
    expect(normalizeDeckPath('')).toBe('Default');
    expect(normalizeDeckPath(undefined)).toBe('Default');
  });
  it('parses tags', () => {
    expect(parseTags('arrays; two-pointers;;arrays ')).toEqual(['arrays', 'two-pointers']);
    expect(parseTags([' a ', 'b', 3, ''])).toEqual(['a', 'b']);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe('CSV', () => {
  it('parses RFC 4180 rows: quotes, doubled quotes, multiline, CRLF, BOM', () => {
    const { rows } = parseCSVRows('\uFEFFa,"b,c","say ""hi"""\r\n"line1\nline2",,x\n');
    expect(rows).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['line1\nline2', '', 'x'],
    ]);
  });
  it('reports unterminated quotes', () => {
    expect(parseCSV('front,back\n"oops,1').errors[0].row).toBe(0);
  });
  it('parses cards with header, tags and nested decks', () => {
    const csv = [
      'front,back,deck,tags',
      '"Two Sum?","Use a **hash map**:\n```java\nMap<Integer,Integer> m = new HashMap<>();\n```","LeetCode::Arrays & Hashing","hash-map;easy"',
      'Q2,A2,,',
    ].join('\n');
    const r = parseCSV(csv);
    expect(r.errors).toEqual([]);
    expect(r.cards).toEqual([
      {
        front: 'Two Sum?',
        back: 'Use a **hash map**:\n```java\nMap<Integer,Integer> m = new HashMap<>();\n```',
        deck: 'LeetCode::Arrays & Hashing',
        tags: ['hash-map', 'easy'],
      },
      { front: 'Q2', back: 'A2', deck: 'Default', tags: [] },
    ]);
  });
  it('accepts any column order / case and ignores extras and blank lines', () => {
    const r = parseCSV('Tags,Deck,Back,Front,notes\nt1,D,b,f,zzz\n\n');
    expect(r.cards).toEqual([{ front: 'f', back: 'b', deck: 'D', tags: ['t1'] }]);
  });
  it('requires front/back header and reports bad rows', () => {
    expect(parseCSV('question,answer\nq,a').errors[0].row).toBe(0);
    const r = parseCSV('front,back,deck,tags\n,b,D,\nonly-front\nok,yes');
    expect(r.cards).toHaveLength(1);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2]);
  });
  it('round-trips through exportCSV', () => {
    const decks = [deck('d1', 'LeetCode'), deck('d2', 'LeetCode::Two Pointers', 'd1')];
    const cards = [
      card({ id: 'a', deckId: 'd2', front: 'He said "x", then\nleft', back: ' lead space', tags: ['a', 'b'] }),
      card({ id: 'b', deckId: 'd1', front: 'plain', back: 'plain' }),
    ];
    const out = exportCSV(cards, decks);
    expect(out.split('\r\n')[0]).toBe('front,back,deck,tags');
    expect(out).toContain('"He said ""x"", then\nleft"');
    const r = parseCSV(out);
    expect(r.errors).toEqual([]);
    expect(r.cards).toEqual([
      { front: 'He said "x", then\nleft', back: ' lead space', deck: 'LeetCode::Two Pointers', tags: ['a', 'b'] },
      { front: 'plain', back: 'plain', deck: 'LeetCode', tags: [] },
    ]);
  });
});

describe('JSON', () => {
  it('parses versioned format', () => {
    const r = parseJSON(JSON.stringify({ version: 1, cards: [{ front: 'f', back: 'b', deck: 'A::B', tags: ['t'] }] }));
    expect(r).toEqual({ cards: [{ front: 'f', back: 'b', deck: 'A::B', tags: ['t'] }], errors: [] });
  });
  it('accepts a bare array and defaults deck/tags', () => {
    const r = parseJSON('[{"front":"f","back":"b"}]');
    expect(r.cards).toEqual([{ front: 'f', back: 'b', deck: 'Default', tags: [] }]);
  });
  it('rejects invalid JSON, wrong version and wrong shape', () => {
    expect(parseJSON('{').errors[0].row).toBe(0);
    expect(parseJSON('{"version":2,"cards":[]}').errors[0].message).toMatch(/version/);
    expect(parseJSON('{"foo":1}').errors[0].row).toBe(0);
  });
  it('reports per-card errors and keeps valid cards', () => {
    const r = parseJSON('[{"front":"","back":"b"},{"front":"f"},"x",{"front":"ok","back":"","fsrs":{"due":"nope"}},{"front":"ok","back":""}]');
    expect(r.cards).toHaveLength(1);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2, 3, 4]);
  });
  it('preserves id and fsrs on full export/import round trip', () => {
    const fsrs = { ...createEmptyCard(new Date(NOW)), state: State.Review, stability: 12.5, difficulty: 4.2, reps: 3, last_review: new Date(NOW - 86400000) };
    const decks = [deck('d1', 'LeetCode'), deck('d2', 'LeetCode::Graphs', 'd1')];
    const cards = [card({ id: 'keep-me', deckId: 'd2', tags: ['bfs'], fsrs })];
    const r = parseJSON(exportJSON(cards, decks));
    expect(r.errors).toEqual([]);
    expect(r.cards[0]).toEqual({ id: 'keep-me', front: 'F', back: 'B', deck: 'LeetCode::Graphs', tags: ['bfs'], fsrs });
    expect(r.cards[0].fsrs!.due).toBeInstanceOf(Date);
  });
  it('omits id/fsrs when includeScheduling is false', () => {
    const out = JSON.parse(exportJSON([card({ deckId: 'd1' })], [deck('d1', 'X')], { includeScheduling: false }));
    expect(out).toEqual({ version: 1, cards: [{ front: 'F', back: 'B', deck: 'X', tags: [] }] });
  });
  it('accepts named fsrs state', () => {
    const r = parseJSON('[{"front":"f","back":"b","fsrs":{"due":"2026-10-21T00:00:00.000Z","stability":1,"difficulty":5,"state":"Review"}}]');
    expect(r.cards[0].fsrs!.state).toBe(State.Review);
    expect(r.cards[0].fsrs!.reps).toBe(0);
  });
});

describe('deck resolution', () => {
  it('auto-creates nested decks and ancestors once, reusing existing', () => {
    n = 0;
    const existing = [deck('L', 'LeetCode')];
    const { created, deckIdByPath } = resolveDecks(
      ['LeetCode::Two Pointers', 'LeetCode::Two Pointers', 'System Design::Caching::CDN'],
      existing, NOW, gen,
    );
    expect(created.map((d) => [d.path, d.name, d.parentId])).toEqual([
      ['LeetCode::Two Pointers', 'Two Pointers', 'L'],
      ['System Design', 'System Design', null],
      ['System Design::Caching', 'Caching', 'id2'],
      ['System Design::Caching::CDN', 'CDN', 'id3'],
    ]);
    expect(deckIdByPath.get('LeetCode')).toBe('L');
  });
  it('materializes cards with new ids/fsrs or preserved ones', () => {
    n = 0;
    const r = parseJSON('[{"front":"a","back":"b","deck":"X::Y"},{"id":"fixed","front":"c","back":"d","deck":"X"}]');
    const { decks, cards } = materialize(r, [], NOW, gen);
    expect(decks.map((d) => d.path)).toEqual(['X', 'X::Y']);
    expect(cards[0].deckId).toBe(decks[1].id);
    expect(cards[0].fsrs.state).toBe(State.New);
    expect(cards[1].id).toBe('fixed');
    expect(cards[1].deckId).toBe(decks[0].id);
  });
});
