import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import type { Card, Deck, ReviewLog } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { parseJSON } from './importExport';
import * as db from './db';
import {
  computeBase, GistClient, GIST_DESCRIPTION, GIST_FILENAME, mergeSnapshots, parseSnapshot, serializeSnapshot, snapshotHash,
  idbLocalStore, SyncEngine, SyncError, syncedSettings, TOKEN_KEY, type KV, type LocalStore, type Snapshot,
} from './sync';

const T0 = Date.UTC(2026, 9, 1);
const deck = (id: string, path: string, t = T0): Deck => ({ id, name: path.split('::').pop()!, path, parentId: null, createdAt: t, updatedAt: t });
const card = (id: string, deckId = 'd1', o: Partial<Card> = {}): Card => ({
  id, deckId, front: `Q ${id}`, back: `A ${id}`, tags: [], createdAt: T0, updatedAt: T0, fsrs: createEmptyCard(new Date(T0)), ...o,
});
const reviewed = (c: Card, at: number, reps = 1): Card => ({
  ...c, updatedAt: at, fsrs: { ...c.fsrs, reps, last_review: new Date(at), due: new Date(at + 86400000), state: 2, stability: 3 },
});
const log = (id: string, cardId: string, at: number): ReviewLog => ({
  id, cardId, deckId: 'd1', rating: 3, reviewedAt: at,
  fsrs: { rating: 3, state: 0, due: new Date(at), stability: 0, difficulty: 0, elapsed_days: 0, last_elapsed_days: 0, scheduled_days: 0, learning_steps: 0, review: new Date(at) },
});
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({ decks: [deck('d1', 'LeetCode')], cards: [], logs: [], settings: syncedSettings({}), tombstones: [], ...o });
const ids = (s: Snapshot) => s.cards.map((c) => c.id);

describe('mergeSnapshots', () => {
  it('first sync (no base) unions cards and decks from both sides', () => {
    const m = mergeSnapshots(snap({ cards: [card('a')] }), snap({ cards: [card('b')] }), null, T0);
    expect(ids(m)).toEqual(['a', 'b']);
    expect(m.decks.map((d) => d.id)).toEqual(['d1']);
    expect(m.tombstones).toEqual([]);
  });

  it('takes the side that changed since base; both changed → newer updatedAt wins', () => {
    const base = computeBase(snap({ cards: [card('a'), card('b')] }));
    const local = snap({ cards: [card('a', 'd1', { front: 'local edit', updatedAt: T0 + 5 }), card('b', 'd1', { front: 'L', updatedAt: T0 + 9 })] });
    const remote = snap({ cards: [card('a'), card('b', 'd1', { front: 'R', updatedAt: T0 + 7 })] });
    const m = mergeSnapshots(local, remote, base, T0 + 10);
    expect(m.cards.find((c) => c.id === 'a')!.front).toBe('local edit'); // only local changed (even though remote equal-time)
    expect(m.cards.find((c) => c.id === 'b')!.front).toBe('L'); // both changed, local newer

    const m2 = mergeSnapshots(remote, local, base, T0 + 10); // symmetric
    expect(m2.cards.find((c) => c.id === 'b')!.front).toBe('L');
  });

  it('merges content and scheduling independently (edit on one device, review on the other)', () => {
    const base = computeBase(snap({ cards: [card('a')] }));
    const local = snap({ cards: [card('a', 'd1', { back: 'better answer', updatedAt: T0 + 100 })] });
    const remote = snap({ cards: [reviewed(card('a'), T0 + 200)] }); // reviewed later → updatedAt bumped
    const m = mergeSnapshots(local, remote, base, T0 + 300);
    const a = m.cards[0];
    expect(a.back).toBe('better answer');
    expect(a.fsrs.reps).toBe(1);
    expect(new Date(a.fsrs.last_review!).getTime()).toBe(T0 + 200);
    expect(a.updatedAt).toBe(T0 + 200);
  });

  it('a delete propagates as a tombstone and removes the card on the other device', () => {
    const both = snap({ cards: [card('a'), card('b')], logs: [log('l1', 'a', T0), log('l2', 'b', T0)] });
    const base = computeBase(both);
    const local = snap({ cards: [card('b')], logs: [log('l2', 'b', T0)] }); // 'a' deleted here
    const m = mergeSnapshots(local, both, base, T0 + 50);
    expect(ids(m)).toEqual(['b']);
    expect(m.tombstones).toEqual([{ id: 'a', kind: 'card', deletedAt: T0 + 50 }]);
    expect(m.logs.map((l) => l.id)).toEqual(['l2']);

    // Other device (still has 'a', unchanged since its base) pulls the tombstone.
    const other = mergeSnapshots(both, m, base, T0 + 60);
    expect(ids(other)).toEqual(['b']);
    expect(other.tombstones.map((t) => t.id)).toEqual(['a']);
  });

  it('edit beats delete: a card changed since base survives a remote tombstone', () => {
    const base = computeBase(snap({ cards: [card('a')] }));
    const local = snap({ cards: [card('a', 'd1', { front: 'edited', updatedAt: T0 + 1 })] });
    const remote = snap({ cards: [], tombstones: [{ id: 'a', kind: 'card', deletedAt: T0 + 2 }] });
    const m = mergeSnapshots(local, remote, base, T0 + 3);
    expect(ids(m)).toEqual(['a']);
    expect(m.tombstones).toEqual([]);
  });

  it('new device (no base): tombstone removes an unreviewed copy, keeps one reviewed after the delete', () => {
    const remote = snap({ tombstones: [{ id: 'seed-1', kind: 'card', deletedAt: T0 + 10 }, { id: 'seed-2', kind: 'card', deletedAt: T0 + 10 }] });
    const local = snap({ cards: [card('seed-1', 'd1', { updatedAt: T0 + 99 }), reviewed(card('seed-2'), T0 + 20)] });
    const m = mergeSnapshots(local, remote, null, T0 + 100);
    expect(ids(m)).toEqual(['seed-2']);
    expect(m.tombstones.map((t) => t.id)).toEqual(['seed-1']);
  });

  it('review logs are a union by id', () => {
    const base = computeBase(snap({ cards: [card('a')], logs: [log('l1', 'a', T0)] }));
    const local = snap({ cards: [card('a')], logs: [log('l1', 'a', T0), log('l2', 'a', T0 + 2)] });
    const remote = snap({ cards: [card('a')], logs: [log('l1', 'a', T0), log('l3', 'a', T0 + 1)] });
    const m = mergeSnapshots(local, remote, base, T0 + 3);
    expect(m.logs.map((l) => l.id)).toEqual(['l1', 'l3', 'l2']);
  });

  it('collapses same-path decks created independently and remaps cards to the oldest', () => {
    const local = snap({ decks: [deck('dl', 'LeetCode', T0 + 5)], cards: [card('a', 'dl')] });
    const remote = snap({ decks: [deck('dr', 'LeetCode', T0)], cards: [card('b', 'dr')] });
    const m = mergeSnapshots(local, remote, null, T0 + 10);
    expect(m.decks.map((d) => d.id)).toEqual(['dr']);
    expect(m.cards.map((c) => c.deckId)).toEqual(['dr', 'dr']);
  });

  it('deck delete propagates; a card added meanwhile resurrects its deck', () => {
    const start = snap({ decks: [deck('d1', 'LeetCode'), deck('d2', 'Behavioral')], cards: [card('a', 'd2')] });
    const base = computeBase(start);
    const local = snap({ decks: [deck('d1', 'LeetCode')] }); // deleted deck d2 + its card
    const m = mergeSnapshots(local, start, base, T0 + 1);
    expect(m.decks.map((d) => d.id)).toEqual(['d1']);
    expect(m.tombstones.map((t) => `${t.kind}:${t.id}`).sort()).toEqual(['card:a', 'deck:d2']);

    const remoteWithNew = snap({ decks: start.decks, cards: [card('a', 'd2'), card('new', 'd2', { createdAt: T0 + 2 })] });
    const m2 = mergeSnapshots(local, remoteWithNew, base, T0 + 3);
    expect(m2.decks.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
    expect(ids(m2)).toEqual(['new']);
  });

  it('rebuilds parent links from paths, creating missing ancestors', () => {
    const m = mergeSnapshots(snap({ decks: [deck('x', 'LeetCode::Graphs')], cards: [card('a', 'x')] }), snap({ decks: [] }), null, T0);
    const parent = m.decks.find((d) => d.path === 'LeetCode')!;
    expect(parent).toBeDefined();
    expect(m.decks.find((d) => d.id === 'x')!.parentId).toBe(parent.id);
  });

  it('settings: remote wins only if local is unchanged since base', () => {
    const s0 = snap();
    const base = computeBase(s0);
    const remote = snap({ settings: { ...s0.settings, newCardsPerDay: 5 } });
    expect(mergeSnapshots(s0, remote, base, T0).settings.newCardsPerDay).toBe(5);
    const local = snap({ settings: { ...s0.settings, newCardsPerDay: 50 } });
    expect(mergeSnapshots(local, remote, base, T0).settings.newCardsPerDay).toBe(50);
  });

  it('remote unchanged (304) → local plus tombstones for local deletions', () => {
    const s = snap({ cards: [card('a'), card('b')] });
    const m = mergeSnapshots(snap({ cards: [card('b')] }), null, computeBase(s), T0 + 1);
    expect(ids(m)).toEqual(['b']);
    expect(m.tombstones.map((t) => t.id)).toEqual(['a']);
  });

  it('is idempotent and converges from both sides', () => {
    const base = computeBase(snap({ cards: [card('a')] }));
    const L = snap({ cards: [reviewed(card('a'), T0 + 5), card('l')], logs: [log('x', 'a', T0 + 5)] });
    const R = snap({ cards: [card('a', 'd1', { front: 'new', updatedAt: T0 + 3 }), card('r')] });
    const m1 = mergeSnapshots(L, R, base, T0 + 9);
    const m2 = mergeSnapshots(R, L, base, T0 + 9);
    expect(snapshotHash(m1)).toBe(snapshotHash(m2));
    expect(snapshotHash(mergeSnapshots(m1, m1, computeBase(m1), T0 + 10))).toBe(snapshotHash(m1));
  });
});

describe('serialize / parse', () => {
  it('round-trips, keeps Dates, and stays importable as a JSON backup', () => {
    const s = snap({ cards: [reviewed(card('a', 'd1', { tags: ['x'] }), T0 + 5)], logs: [log('l', 'a', T0)], tombstones: [{ id: 'z', kind: 'card', deletedAt: 1 }] });
    const text = serializeSnapshot(s, T0);
    const back = parseSnapshot(text);
    expect(snapshotHash(back)).toBe(snapshotHash(s));
    expect(back.cards[0].fsrs.last_review).toBeInstanceOf(Date);
    expect(back.logs[0].fsrs.review).toBeInstanceOf(Date);
    const asBackup = parseJSON(text);
    expect(asBackup.errors).toEqual([]);
    expect(asBackup.cards[0]).toMatchObject({ id: 'a', deck: 'LeetCode', tags: ['x'] });
  });
  it('never includes the token or per-device seed bookkeeping', () => {
    const text = serializeSnapshot(snap({ settings: syncedSettings({ ...DEFAULT_SETTINGS, seeded: true, seedVersions: { './x.json': { hash: 'h', cards: {}, importedAt: 0 } } }) }));
    expect(text).not.toMatch(/seeded|seedVersions|token/i);
  });
  it('rejects garbage', () => {
    expect(() => parseSnapshot('nope')).toThrow();
    expect(() => parseSnapshot('{"version":2,"cards":[]}')).toThrow(/version/);
  });
});

// ---------- fake GitHub ----------

interface FakeGist { id: string; description: string; public: boolean; content: string; updated: number }
function fakeGitHub(opts: { token?: string } = {}) {
  const token = opts.token ?? 'good';
  const gists = new Map<string, FakeGist>();
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  let n = 0;
  const etagOf = (g: FakeGist) => `"v${g.updated}"`;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const gistJson = (g: FakeGist) => ({ id: g.id, description: g.description, public: g.public, updated_at: new Date(g.updated).toISOString(), files: { [GIST_FILENAME]: { content: g.content, truncated: false } } });
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ method, url, headers });
    if (headers.Authorization !== `Bearer ${token}`) return json({ message: 'Bad credentials' }, 401);
    const path = url.replace('https://api.github.com', '');
    if (path === '/user') return json({ login: 'octo' });
    if (path.startsWith('/gists?')) return json([...gists.values()].map(gistJson));
    if (path === '/gists' && method === 'POST') {
      const b = JSON.parse(init.body as string);
      const g: FakeGist = { id: `g${++n}`, description: b.description, public: b.public, content: b.files[GIST_FILENAME].content, updated: ++n };
      gists.set(g.id, g);
      return json(gistJson(g), 201, { etag: etagOf(g) });
    }
    const m = path.match(/^\/gists\/(\w+)$/);
    const g = m && gists.get(m[1]);
    if (!g) return json({ message: 'Not Found' }, 404);
    if (method === 'PATCH') {
      g.content = JSON.parse(init.body as string).files[GIST_FILENAME].content;
      g.updated = ++n;
      return json(gistJson(g), 200, { etag: etagOf(g) });
    }
    if (headers['If-None-Match'] === etagOf(g)) return new Response(null, { status: 304 });
    return json(gistJson(g), 200, { etag: etagOf(g) });
  });
  return { gists, calls, fetch: fetchImpl as unknown as typeof fetch };
}

const memKV = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

/** In-memory LocalStore standing in for IndexedDB. */
function memLocal(initial: Snapshot): LocalStore & { data: Snapshot } {
  const s = { data: structuredClone(initial) } as LocalStore & { data: Snapshot };
  s.read = async () => structuredClone({ ...s.data, tombstones: [] });
  s.apply = async (_prev, next) => { s.data = structuredClone({ ...next, tombstones: [] }); return { skipped: false }; };
  return s;
}

describe('GistClient', () => {
  it('maps HTTP failures to clear errors', async () => {
    const res = (status: number, headers: Record<string, string> = {}) => vi.fn(async () => new Response('{}', { status, headers })) as unknown as typeof fetch;
    await expect(new GistClient('t', res(401)).getLogin()).rejects.toMatchObject({ code: 'auth' });
    await expect(new GistClient('t', res(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' })).getLogin()).rejects.toMatchObject({ code: 'rate-limit', retryAt: 2000000000000 });
    await expect(new GistClient('t', res(429, { 'retry-after': '30' })).getLogin()).rejects.toMatchObject({ code: 'rate-limit' });
    await expect(new GistClient('t', res(403)).getLogin()).rejects.toMatchObject({ code: 'forbidden' });
    await expect(new GistClient('t', res(500)).getLogin()).rejects.toMatchObject({ code: 'server' });
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(new GistClient('t', offline).getLogin()).rejects.toBeInstanceOf(SyncError);
    await expect(new GistClient('t', offline).getLogin()).rejects.toMatchObject({ code: 'offline' });
  });

  it('sends auth + API headers and finds the gist by description', async () => {
    const gh = fakeGitHub();
    const c = new GistClient('good', gh.fetch);
    expect(await c.findGist()).toBeNull();
    const { id } = await c.createGist('{}');
    expect(gh.gists.get(id)).toMatchObject({ description: GIST_DESCRIPTION, public: false });
    expect(await c.findGist()).toBe(id);
    expect(gh.calls[0].headers).toMatchObject({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    const first = await c.getGist(id);
    expect(await c.getGist(id, first!.etag)).toBeNull(); // 304
  });

  it('fetches raw_url when gist content is truncated', async () => {
    const f = vi.fn(async (u: RequestInfo | URL) => String(u).includes('raw')
      ? new Response('FULL', { status: 200 })
      : new Response(JSON.stringify({ files: { [GIST_FILENAME]: { content: 'PART', truncated: true, raw_url: 'https://gist.githubusercontent.com/raw/x' } } }), { status: 200 })) as unknown as typeof fetch;
    expect((await new GistClient('t', f).getGist('x'))!.content).toBe('FULL');
  });
});

describe('SyncEngine (mock fetch)', () => {
  it('connect creates a secret gist; a second device finds it and both converge', async () => {
    const gh = fakeGitHub();
    const A = memLocal(snap({ decks: [deck('dA', 'LeetCode', T0)], cards: [card('a', 'dA')] }));
    const kvA = memKV();
    const ea = new SyncEngine(A, { kv: kvA, fetch: gh.fetch });
    await ea.connect(' good ');
    expect(gh.gists.size).toBe(1);
    expect(kvA.m.get(TOKEN_KEY)).toBe('good');
    expect([...gh.gists.values()][0].content).not.toContain('good'); // token never in the gist
    expect(ea.getStatus()).toMatchObject({ state: 'idle', login: 'octo' });

    const B = memLocal(snap({ decks: [deck('dB', 'LeetCode', T0 + 1)], cards: [card('b', 'dB')] }));
    const eb = new SyncEngine(B, { kv: memKV(), fetch: gh.fetch });
    await eb.connect('good');
    expect(gh.gists.size).toBe(1);
    expect(ids(B.data)).toEqual(['a', 'b']);
    expect(B.data.decks.map((d) => d.id)).toEqual(['dA']);

    await ea.sync();
    expect(ids(A.data)).toEqual(['a', 'b']);

    // Delete on A propagates to B.
    A.data.cards = A.data.cards.filter((c) => c.id !== 'a');
    await ea.sync();
    await eb.sync();
    expect(ids(B.data)).toEqual(['b']);
  });

  it('does not push when nothing changed (conditional GET → 304)', async () => {
    const gh = fakeGitHub();
    const e = new SyncEngine(memLocal(snap({ cards: [card('a')] })), { kv: memKV(), fetch: gh.fetch });
    await e.connect('good');
    gh.calls.length = 0;
    const r = await e.sync();
    expect(r).toMatchObject({ pushed: false, localChanged: false });
    expect(gh.calls.map((c) => c.method)).toEqual(['GET']);
    expect(gh.calls[0].headers['If-None-Match']).toBeTruthy();
  });

  it('re-merges instead of clobbering when the gist changes between pull and push', async () => {
    const gh = fakeGitHub();
    const A = memLocal(snap({ cards: [card('a')] }));
    const e = new SyncEngine(A, { kv: memKV(), fetch: gh.fetch });
    await e.connect('good');
    const g = [...gh.gists.values()][0];
    A.data.cards.push(card('local'));
    // Another device writes right after our pull.
    let pulls = 0;
    const orig = gh.fetch;
    const racing = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const r = await orig(u, init);
      if ((init?.method ?? 'GET') === 'GET' && String(u).endsWith(g.id) && pulls++ === 0) {
        const other = parseSnapshot(g.content);
        other.cards.push(card('other'));
        g.content = serializeSnapshot(other);
        g.updated += 100;
      }
      return r;
    }) as typeof fetch;
    const e2 = new SyncEngine(A, { kv: (e as unknown as { kv: KV }).kv, fetch: racing });
    await e2.sync();
    expect(ids(parseSnapshot(g.content)).sort()).toEqual(['a', 'local', 'other']);
    expect(ids(A.data).sort()).toEqual(['a', 'local', 'other']);
  });

  it('bad token: clear error, stays disconnected, nothing stored', async () => {
    const gh = fakeGitHub();
    const kv = memKV();
    const e = new SyncEngine(memLocal(snap()), { kv, fetch: gh.fetch });
    await expect(e.connect('nope')).rejects.toMatchObject({ code: 'auth' });
    expect(e.getStatus()).toMatchObject({ state: 'disconnected', errorCode: 'auth' });
    expect(e.getStatus().error).toMatch(/token/i);
    expect(kv.m.size).toBe(0);
  });

  it('offline: queues silently and retries later', async () => {
    const gh = fakeGitHub();
    let online = true;
    const flaky = (async (u: RequestInfo | URL, i?: RequestInit) => { if (!online) throw new TypeError('Failed to fetch'); return gh.fetch(u, i); }) as typeof fetch;
    const A = memLocal(snap());
    const e = new SyncEngine(A, { kv: memKV(), fetch: flaky });
    await e.connect('good');
    online = false;
    A.data.cards.push(card('x'));
    expect(await e.sync()).toBeNull();
    expect(e.getStatus()).toMatchObject({ state: 'offline', error: undefined });
    expect(e.isPending()).toBe(true);
    online = true;
    expect(await e.sync()).toMatchObject({ pushed: true });
    expect(e.isPending()).toBe(false);
    expect(ids(parseSnapshot([...gh.gists.values()][0].content))).toEqual(['x']);
  });

  it('recreates the gist if it was deleted on GitHub', async () => {
    const gh = fakeGitHub();
    const A = memLocal(snap({ cards: [card('a')] }));
    const e = new SyncEngine(A, { kv: memKV(), fetch: gh.fetch });
    await e.connect('good');
    gh.gists.clear();
    await e.sync();
    expect(gh.gists.size).toBe(1);
    expect(ids(parseSnapshot([...gh.gists.values()][0].content))).toEqual(['a']);
  });

  it('disconnect forgets token + state only', async () => {
    const gh = fakeGitHub();
    const kv = memKV();
    const e = new SyncEngine(memLocal(snap()), { kv, fetch: gh.fetch });
    await e.connect('good');
    e.disconnect();
    expect(kv.m.size).toBe(0);
    expect(gh.gists.size).toBe(1);
    expect(e.getStatus().state).toBe('disconnected');
    expect(await e.sync()).toBeNull();
  });
});

describe('idbLocalStore.apply', () => {
  it('writes the merged snapshot into IndexedDB (renames, same-path dedupe, deletes) and leaves concurrent edits alone', async () => {
    const conn = await db.openDB();
    for (const st of ['decks', 'cards', 'logs', 'settings']) await conn.clear(st);
    await db.putDeck(deck('dl', 'LeetCode'));
    await db.putCard(card('a', 'dl'));
    await db.putCard(card('gone', 'dl'));
    await db.putCard(card('busy', 'dl'));
    await db.addLog(log('l-gone', 'gone', T0));
    const prev = await idbLocalStore.read();
    // User edits 'busy' while sync runs.
    await db.putCard(card('busy', 'dl', { front: 'typing…', updatedAt: T0 + 1 }));
    const next: Snapshot = {
      ...prev,
      decks: [deck('dr', 'LeetCode')], // same path, canonical id from the other device
      cards: [card('a', 'dr', { front: 'remote edit' }), card('busy', 'dr', { front: 'remote' }), card('new', 'dr')],
      logs: [log('l-new', 'new', T0)],
      settings: { ...prev.settings, newCardsPerDay: 7 },
    };
    const r = await idbLocalStore.apply(prev, next);
    expect(r.skipped).toBe(true);
    expect((await db.listDecks()).map((d) => d.id)).toEqual(['dr']);
    const cards = new Map((await db.listCards()).map((c) => [c.id, c]));
    expect([...cards.keys()].sort()).toEqual(['a', 'busy', 'new']);
    expect(cards.get('a')!.front).toBe('remote edit');
    expect(cards.get('busy')!.front).toBe('typing…');
    expect((await db.listLogs()).map((l) => l.id)).toEqual(['l-new']);
    expect((await db.getSettings()).newCardsPerDay).toBe(7);
    expect((await db.getCard('a'))!.fsrs.due).toBeInstanceOf(Date);
  });
});
