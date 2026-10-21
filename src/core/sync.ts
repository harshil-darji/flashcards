/**
 * Cross-device sync through one secret GitHub gist (description `flashcards-sync`, file `flashcards.json`).
 *
 * Sync = pull → three-way merge (local, remote, base = what this device last synced) → apply locally → push if changed.
 * - Cards/decks merge by id. Content (front/back/tags/deck) and scheduling (fsrs) merge separately: content takes the
 *   side that changed since base (both changed → newer `updatedAt`), scheduling takes the more recent review.
 * - Deletions: ids present in base but missing locally become tombstones, which travel in the gist so deletes propagate.
 *   An edit made since base on the other side beats a delete ("edit wins").
 * - Review logs are an append-only union by id.
 * - Decks with the same path but different ids (each device created "LeetCode::…" on its own) collapse to one id.
 * The token lives in localStorage on this device only and is never part of the gist or any export.
 */
import type { Card, Deck, ID, ReviewLog, Settings, Timestamp } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { DEFAULT_DECK, DECK_SEPARATOR, normalizeDeckPath, parseTags, reviveFsrs } from './importExport';
import * as db from './db';
import { hashString, hashValue, stableStringify } from './hash';

export const GIST_DESCRIPTION = 'flashcards-sync';
export const GIST_FILENAME = 'flashcards.json';
export const SYNC_FORMAT = 'flashcards-sync';
export const SYNC_FORMAT_VERSION = 1;
/** Tombstones older than this are dropped. */
export const TOMBSTONE_TTL_MS = 365 * 24 * 3600 * 1000;

export interface Tombstone { id: ID; kind: 'card' | 'deck'; deletedAt: Timestamp }

/** Settings that travel between devices (seed bookkeeping is per device). */
export type SyncedSettings = Omit<Settings, 'seeded' | 'seedVersions'>;

export interface Snapshot {
  decks: Deck[];
  cards: Card[];
  logs: ReviewLog[];
  settings: SyncedSettings;
  tombstones: Tombstone[];
}

/** Fingerprints of the last merged snapshot this device synced. */
export interface SyncBase {
  hash: string;
  cards: Record<ID, string>;
  decks: Record<ID, string>;
  settings: string;
}

// ---------- fingerprints ----------

const cardContentKey = (c: Card) => hashValue({ f: c.front, b: c.back, t: c.tags, d: c.deckId });
const cardSchedKey = (c: Card) => hashValue(c.fsrs);
const cardKey = (c: Card) => `${cardContentKey(c)}.${cardSchedKey(c)}`;
const deckKey = (d: Deck) => hashValue({ n: d.name, p: d.path });
const settingsKey = (s: SyncedSettings) => hashValue(s);
const lastReviewMs = (c: Card) => (c.fsrs.last_review ? new Date(c.fsrs.last_review).getTime() : 0);
const tombKey = (t: Pick<Tombstone, 'kind' | 'id'>) => `${t.kind}:${t.id}`;
const byId = <T extends { id: ID }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function syncedSettings(s: Partial<Settings>): SyncedSettings {
  const { seeded: _s, seedVersions: _v, ...rest } = { ...DEFAULT_SETTINGS, ...s };
  return rest;
}

/** Order-independent hash of a whole snapshot. */
export function snapshotHash(s: Snapshot): string {
  return hashValue({
    decks: [...s.decks].sort(byId),
    cards: [...s.cards].sort(byId),
    logs: [...s.logs].sort(byId),
    settings: s.settings,
    tombstones: [...s.tombstones].sort((a, b) => tombKey(a).localeCompare(tombKey(b))),
  });
}

/** Same as snapshotHash but ignoring tombstones (they aren't stored in IndexedDB). */
export const localDataHash = (s: Snapshot) => snapshotHash({ ...s, tombstones: [] });

export function computeBase(s: Snapshot): SyncBase {
  return {
    hash: snapshotHash(s),
    cards: Object.fromEntries(s.cards.map((c) => [c.id, cardKey(c)])),
    decks: Object.fromEntries(s.decks.map((d) => [d.id, deckKey(d)])),
    settings: settingsKey(s.settings),
  };
}

// ---------- merge (pure) ----------

/** Deterministic id for an auto-created deck, so devices creating the same path agree. */
export const deckIdForPath = (path: string) => `deck-${hashString(path)}`;

function pickByKey<T>(l: T, r: T, lk: string, rk: string, bk: string | undefined, lt: number, rt: number): T {
  if (lk === rk) return l;
  if (bk !== undefined) {
    if (lk === bk) return r; // only remote changed
    if (rk === bk) return l; // only local changed
  }
  if (lt !== rt) return lt > rt ? l : r;
  return lk < rk ? l : r; // deterministic tie-break
}

/**
 * Three-way merge. `remote === null` means the gist is unchanged since `base` (HTTP 304), so the result is local plus
 * tombstones for local deletions. `now` stamps new tombstones.
 */
export function mergeSnapshots(local: Snapshot, remote: Snapshot | null, base: SyncBase | null, now: number = Date.now()): Snapshot {
  const tombs = new Map<string, Tombstone>();
  const addTomb = (t: Tombstone) => {
    const k = tombKey(t);
    const prev = tombs.get(k);
    if (!prev || t.deletedAt > prev.deletedAt) tombs.set(k, t);
  };
  local.tombstones.forEach(addTomb);
  remote?.tombstones.forEach(addTomb);

  // Local deletions since the last sync.
  if (base) {
    const lc = new Set(local.cards.map((c) => c.id));
    const ld = new Set(local.decks.map((d) => d.id));
    for (const id of Object.keys(base.cards)) if (!lc.has(id)) addTomb({ id, kind: 'card', deletedAt: now });
    for (const id of Object.keys(base.decks)) if (!ld.has(id)) addTomb({ id, kind: 'deck', deletedAt: now });
  }

  /** One side has the item, a tombstone exists: keep only if it was edited since base (edit beats delete). */
  const survives = (baseVal: string | undefined, key: string, activity: number, t: Tombstone | undefined) => {
    if (!t) return true;
    if (baseVal !== undefined) return key !== baseVal;
    return activity > t.deletedAt;
  };

  // ----- decks -----
  const graveyard = new Map<ID, Deck>();
  const decks = new Map<ID, Deck>();
  const lDecks = new Map(local.decks.map((d) => [d.id, d]));
  const rDecks = new Map((remote ?? { decks: [] as Deck[] }).decks.map((d) => [d.id, d]));
  for (const id of new Set([...lDecks.keys(), ...rDecks.keys()])) {
    const L = lDecks.get(id);
    const R = rDecks.get(id);
    const t = tombs.get(tombKey({ kind: 'deck', id }));
    if (L && R) {
      const p = pickByKey(L, R, deckKey(L), deckKey(R), base?.decks[id], L.updatedAt, R.updatedAt);
      decks.set(id, { ...p, createdAt: Math.min(L.createdAt, R.createdAt), updatedAt: Math.max(L.updatedAt, R.updatedAt) });
      tombs.delete(tombKey({ kind: 'deck', id }));
      continue;
    }
    const X = (L ?? R)!;
    if (!remote && !t) { decks.set(id, X); continue; }
    if (survives(base?.decks[id], deckKey(X), 0, t)) { decks.set(id, X); tombs.delete(tombKey({ kind: 'deck', id })); }
    else graveyard.set(id, X);
  }

  // Collapse decks sharing a path; canonical = oldest (then smallest id).
  const alias = new Map<ID, ID>();
  const byPath = new Map<string, Deck>();
  for (const d of [...decks.values()].sort((a, b) => a.createdAt - b.createdAt || byId(a, b))) {
    const keep = byPath.get(d.path);
    if (keep) { alias.set(d.id, keep.id); decks.delete(d.id); } else byPath.set(d.path, d);
  }
  const resolveDeck = (id: ID) => alias.get(id) ?? id;

  // ----- cards -----
  const cards = new Map<ID, Card>();
  const lCards = new Map(local.cards.map((c) => [c.id, c]));
  const rCards = new Map((remote ?? { cards: [] as Card[] }).cards.map((c) => [c.id, c]));
  for (const id of new Set([...lCards.keys(), ...rCards.keys()])) {
    const L = lCards.get(id);
    const R = rCards.get(id);
    const tk = tombKey({ kind: 'card', id });
    const t = tombs.get(tk);
    let out: Card | undefined;
    if (L && R) {
      const Ln = { ...L, deckId: resolveDeck(L.deckId) };
      const Rn = { ...R, deckId: resolveDeck(R.deckId) };
      const bk = base?.cards[id];
      const bContent = bk?.split('.')[0];
      const content = pickByKey(Ln, Rn, cardContentKey(Ln), cardContentKey(Rn), bContent, Ln.updatedAt, Rn.updatedAt);
      const lr = lastReviewMs(L), rr = lastReviewMs(R);
      const sched = lr !== rr ? (lr > rr ? L : R)
        : L.fsrs.reps !== R.fsrs.reps ? (L.fsrs.reps > R.fsrs.reps ? L : R)
        : cardSchedKey(L) <= cardSchedKey(R) ? L : R;
      out = { ...content, fsrs: sched.fsrs, createdAt: Math.min(L.createdAt, R.createdAt), updatedAt: Math.max(L.updatedAt, R.updatedAt) };
    } else {
      const X = (L ?? R)!;
      if ((!remote && !t) || survives(base?.cards[id], cardKey(X), lastReviewMs(X), t)) out = { ...X, deckId: resolveDeck(X.deckId) };
    }
    if (out) { cards.set(id, out); tombs.delete(tk); }
  }

  // ----- deck integrity: every card's deck exists; every deck's ancestors exist; parentIds follow paths -----
  const pathIndex = () => new Map([...decks.values()].map((d) => [d.path, d]));
  const revive = (d: Deck) => { decks.set(d.id, d); graveyard.delete(d.id); tombs.delete(tombKey({ kind: 'deck', id: d.id })); };
  for (const c of cards.values()) {
    if (decks.has(c.deckId)) continue;
    const dead = graveyard.get(c.deckId);
    if (dead && !pathIndex().has(dead.path)) { revive(dead); continue; }
    const target = dead ? pathIndex().get(dead.path)! : (pathIndex().get(DEFAULT_DECK) ?? (() => {
      const d: Deck = { id: deckIdForPath(DEFAULT_DECK), name: DEFAULT_DECK, path: DEFAULT_DECK, parentId: null, createdAt: now, updatedAt: now };
      decks.set(d.id, d);
      return d;
    })());
    cards.set(c.id, { ...c, deckId: target.id });
  }
  for (const d of [...decks.values()].sort((a, b) => a.path.split(DECK_SEPARATOR).length - b.path.split(DECK_SEPARATOR).length)) {
    const parts = d.path.split(DECK_SEPARATOR);
    let parentId: ID | null = null;
    for (let i = 1; i < parts.length; i++) {
      const p = parts.slice(0, i).join(DECK_SEPARATOR);
      let anc = pathIndex().get(p);
      if (!anc) {
        const dead = [...graveyard.values()].find((g) => g.path === p);
        if (dead) { revive(dead); anc = dead; }
        else {
          anc = { id: deckIdForPath(p), name: parts[i - 1], path: p, parentId, createdAt: now, updatedAt: now };
          decks.set(anc.id, anc);
        }
      }
      if (anc.parentId !== parentId) decks.set(anc.id, (anc = { ...anc, parentId }));
      parentId = anc.id;
    }
    const cur = decks.get(d.id)!;
    if (cur.parentId !== parentId) decks.set(d.id, { ...cur, parentId });
  }

  // ----- logs: union by id, minus logs of deleted cards -----
  const logs = new Map<ID, ReviewLog>();
  for (const l of [...local.logs, ...(remote?.logs ?? [])]) if (!logs.has(l.id) && cards.has(l.cardId)) logs.set(l.id, l);

  // ----- settings -----
  let settings = local.settings;
  if (remote) {
    const lk = settingsKey(local.settings), rk = settingsKey(remote.settings);
    if (lk !== rk && base && lk === base.settings) settings = remote.settings;
  }

  const tombstones = [...tombs.values()].filter((t) => t.deletedAt >= now - TOMBSTONE_TTL_MS && !(t.kind === 'card' ? cards.has(t.id) : decks.has(t.id)));
  return {
    decks: [...decks.values()].sort((a, b) => a.path.localeCompare(b.path)),
    cards: [...cards.values()].sort(byId),
    logs: [...logs.values()].sort((a, b) => a.reviewedAt - b.reviewedAt || byId(a, b)),
    settings,
    tombstones: tombstones.sort((a, b) => tombKey(a).localeCompare(tombKey(b))),
  };
}

// ---------- (de)serialization ----------

/**
 * Gist file. A superset of the JSON backup format (docs/IMPORT_FORMAT.md): `cards[]` carry `id`, `deck` path and `fsrs`,
 * so the file can also be imported as a regular backup.
 */
export function serializeSnapshot(s: Snapshot, now: number = Date.now()): string {
  const paths = new Map(s.decks.map((d) => [d.id, d.path]));
  return JSON.stringify({
    version: SYNC_FORMAT_VERSION,
    format: SYNC_FORMAT,
    exportedAt: new Date(now).toISOString(),
    decks: s.decks,
    cards: s.cards.map((c) => ({ ...c, deck: paths.get(c.deckId) ?? DEFAULT_DECK })),
    logs: s.logs,
    settings: s.settings,
    tombstones: s.tombstones,
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Parses a gist file (or a plain JSON backup). Throws on malformed data. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Sync file is not valid JSON.'); }
  const o: Record<string, unknown> = Array.isArray(raw) ? { cards: raw } : isObj(raw) ? raw : {};
  if (o.version !== undefined && o.version !== SYNC_FORMAT_VERSION) throw new Error(`Unsupported sync file version ${String(o.version)}.`);
  if (!Array.isArray(o.cards)) throw new Error('Sync file has no cards array.');
  const now = Date.now();
  const decks: Deck[] = (Array.isArray(o.decks) ? o.decks : []).filter(isObj).map((d) => ({
    id: String(d.id), name: String(d.name ?? ''), path: normalizeDeckPath(String(d.path ?? d.name ?? '')),
    parentId: typeof d.parentId === 'string' ? d.parentId : null,
    createdAt: num(d.createdAt, 0), updatedAt: num(d.updatedAt, 0),
  }));
  const deckByPath = new Map(decks.map((d) => [d.path, d.id]));
  const deckIds = new Set(decks.map((d) => d.id));
  const cards: Card[] = o.cards.filter(isObj).map((c, i) => {
    if (typeof c.id !== 'string' || !c.id) throw new Error(`Sync file card ${i + 1} has no id.`);
    let deckId = typeof c.deckId === 'string' && deckIds.has(c.deckId) ? c.deckId : undefined;
    if (!deckId) {
      const path = normalizeDeckPath(typeof c.deck === 'string' ? c.deck : '');
      deckId = deckByPath.get(path);
      if (!deckId) {
        deckId = deckIdForPath(path);
        const parts = path.split(DECK_SEPARATOR);
        decks.push({ id: deckId, name: parts[parts.length - 1], path, parentId: null, createdAt: 0, updatedAt: 0 });
        deckByPath.set(path, deckId);
        deckIds.add(deckId);
      }
    }
    return {
      id: c.id, deckId, front: String(c.front ?? ''), back: String(c.back ?? ''), tags: parseTags(c.tags),
      createdAt: num(c.createdAt, 0), updatedAt: num(c.updatedAt, 0),
      fsrs: c.fsrs ? reviveFsrs(c.fsrs) : reviveFsrs({ due: new Date(now), stability: 0, difficulty: 0, state: 0 }),
    };
  });
  const logs: ReviewLog[] = (Array.isArray(o.logs) ? o.logs : []).filter(isObj).filter((l) => typeof l.id === 'string' && isObj(l.fsrs)).map((l) => {
    const f = l.fsrs as Record<string, unknown>;
    return {
      ...(l as unknown as ReviewLog),
      fsrs: { ...(f as unknown as ReviewLog['fsrs']), due: new Date(f.due as string), review: new Date(f.review as string) },
    };
  });
  const tombstones: Tombstone[] = (Array.isArray(o.tombstones) ? o.tombstones : []).filter(isObj)
    .filter((t) => typeof t.id === 'string' && (t.kind === 'card' || t.kind === 'deck'))
    .map((t) => ({ id: t.id as string, kind: t.kind as Tombstone['kind'], deletedAt: num(t.deletedAt, 0) }));
  return { decks, cards, logs, settings: syncedSettings(isObj(o.settings) ? (o.settings as Partial<Settings>) : {}), tombstones };
}

// ---------- GitHub gist client ----------

export type SyncErrorCode = 'auth' | 'forbidden' | 'rate-limit' | 'not-found' | 'offline' | 'server' | 'bad-data';

export class SyncError extends Error {
  code: SyncErrorCode;
  retryAt?: number;
  constructor(code: SyncErrorCode, message: string, retryAt?: number) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.retryAt = retryAt;
  }
}

export interface GistFile { content: string; etag?: string; updatedAt?: string }
type Fetch = typeof fetch;

const API = 'https://api.github.com';

export class GistClient {
  private token: string;
  private fetchImpl: Fetch;
  constructor(token: string, fetchImpl: Fetch = (...a) => fetch(...a)) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  private async req(path: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(path.startsWith('http') ? path : API + path, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch {
      throw new SyncError('offline', 'You’re offline. Changes will sync when you’re back online.');
    }
    if (res.ok || okStatuses.includes(res.status)) return res;
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const retryAfter = Number(res.headers.get('retry-after'));
    if (res.status === 429 || (res.status === 403 && (remaining === '0' || retryAfter > 0))) {
      const at = retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : Date.now() + 60_000;
      throw new SyncError('rate-limit', `GitHub rate limit reached. Sync will retry after ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, at);
    }
    if (res.status === 401) throw new SyncError('auth', 'GitHub rejected this token (wrong, expired, or revoked). Paste a new one.');
    if (res.status === 403) throw new SyncError('forbidden', 'This token can’t access gists. Give it the “Gists: Read and write” permission.');
    if (res.status === 404) throw new SyncError('not-found', 'Sync gist not found.');
    throw new SyncError('server', `GitHub error ${res.status}. Will retry later.`);
  }

  async getLogin(): Promise<string> {
    const u = (await (await this.req('/user')).json()) as { login?: string };
    return u.login ?? '';
  }

  /** Newest gist with description `flashcards-sync` that has `flashcards.json`, or null. */
  async findGist(): Promise<string | null> {
    for (let page = 1; page <= 10; page++) {
      const list = (await (await this.req(`/gists?per_page=100&page=${page}`)).json()) as { id: string; description: string | null; files: Record<string, unknown> }[];
      const hit = list.find((g) => g.description === GIST_DESCRIPTION && g.files && GIST_FILENAME in g.files);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return null;
  }

  async createGist(content: string): Promise<{ id: string } & GistFile> {
    const res = await this.req('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESCRIPTION, public: false, files: { [GIST_FILENAME]: { content } } }) });
    const g = (await res.json()) as { id: string; updated_at?: string };
    return { id: g.id, content, etag: res.headers.get('etag') ?? undefined, updatedAt: g.updated_at };
  }

  /** `null` = not modified since `etag`. */
  async getGist(id: string, etag?: string): Promise<GistFile | null> {
    const res = await this.req(`/gists/${id}`, etag ? { headers: { 'If-None-Match': etag } } : {}, [304]);
    if (res.status === 304) return null;
    const g = (await res.json()) as { updated_at?: string; files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }> };
    const f = g.files?.[GIST_FILENAME];
    if (!f) throw new SyncError('not-found', 'Sync gist has no flashcards.json.');
    let content = f.content ?? '';
    if (f.truncated && f.raw_url) content = await (await this.req(f.raw_url)).text();
    return { content, etag: res.headers.get('etag') ?? undefined, updatedAt: g.updated_at };
  }

  async updateGist(id: string, content: string): Promise<GistFile> {
    const res = await this.req(`/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } }) });
    const g = (await res.json()) as { updated_at?: string };
    return { content, etag: res.headers.get('etag') ?? undefined, updatedAt: g.updated_at };
  }
}

// ---------- device-local state (localStorage) ----------

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const memoryKV = (): KV => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
const defaultKV = (): KV => { try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* blocked */ } return memoryKV(); };

export const TOKEN_KEY = 'flashcards.sync.token';
export const META_KEY = 'flashcards.sync.meta';

export interface SyncMeta {
  gistId?: string;
  login?: string;
  etag?: string;
  remoteUpdatedAt?: string;
  lastSyncedAt?: number;
  base?: SyncBase;
  /** Tombstones from the last merged snapshot (re-sent on every push). */
  tombstones: Tombstone[];
  /** A sync failed (offline, rate limit, server) and should be retried. */
  pending?: boolean;
  retryAt?: number;
}

// ---------- engine ----------

export interface LocalStore {
  read(): Promise<Snapshot>;
  /** Writes `next`; rows that changed since `prev` was read are left alone. Returns whether anything was skipped. */
  apply(prev: Snapshot, next: Snapshot): Promise<{ skipped: boolean }>;
}

export type SyncState = 'disconnected' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus { state: SyncState; login?: string; lastSyncedAt?: number; error?: string; errorCode?: SyncErrorCode }

export interface SyncResult { pulled: boolean; pushed: boolean; localChanged: boolean }

export class SyncEngine {
  private kv: KV;
  private listeners = new Set<() => void>();
  private status: SyncStatus;
  private running: Promise<SyncResult | null> | null = null;
  private again = false;
  /** Called after sync changed local data (e.g. store.reload). */
  onLocalChange: (() => void | Promise<void>) | null = null;

  private local: LocalStore;
  constructor(local: LocalStore, opts: { kv?: KV; fetch?: Fetch; now?: () => number } = {}) {
    this.local = local;
    this.kv = opts.kv ?? defaultKV();
    this.fetchImpl = opts.fetch;
    this.now = opts.now ?? Date.now;
    const m = this.meta();
    this.status = this.token() && m.gistId ? { state: m.pending ? 'offline' : 'idle', login: m.login, lastSyncedAt: m.lastSyncedAt } : { state: 'disconnected' };
  }
  private fetchImpl?: Fetch;
  private now: () => number;

  // status store (useSyncExternalStore-compatible)
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getStatus = () => this.status;
  private setStatus(s: Partial<SyncStatus>, replace = false) {
    this.status = replace ? (s as SyncStatus) : { ...this.status, ...s };
    this.listeners.forEach((l) => l());
  }

  token(): string | null { return this.kv.getItem(TOKEN_KEY); }
  meta(): SyncMeta {
    try { const m = JSON.parse(this.kv.getItem(META_KEY) ?? 'null') as SyncMeta | null; if (m) return { ...m, tombstones: m.tombstones ?? [] }; } catch { /* corrupt */ }
    return { tombstones: [] };
  }
  private saveMeta(m: SyncMeta) { this.kv.setItem(META_KEY, JSON.stringify(m)); }
  isConnected() { return !!this.token() && !!this.meta().gistId; }
  /** True while a retry is owed (offline / rate limited / server error). */
  isPending() { return !!this.meta().pending; }
  retryAt() { return this.meta().retryAt; }
  private client(token = this.token()!) { return new GistClient(token, this.fetchImpl); }

  /** Validates the token, finds or creates the secret gist, then syncs. */
  async connect(rawToken: string): Promise<void> {
    const token = rawToken.trim();
    if (!token) throw new SyncError('auth', 'Paste a GitHub token first.');
    this.setStatus({ state: 'syncing', error: undefined, errorCode: undefined });
    try {
      const c = this.client(token);
      const login = await c.getLogin();
      let gistId = await c.findGist();
      let meta: SyncMeta = { login, tombstones: [] };
      if (!gistId) {
        const snap = await this.local.read();
        const g = await c.createGist(serializeSnapshot(snap, this.now()));
        gistId = g.id;
        meta = { ...meta, gistId, etag: g.etag, remoteUpdatedAt: g.updatedAt, base: computeBase(snap), lastSyncedAt: this.now() };
      } else meta.gistId = gistId;
      this.kv.setItem(TOKEN_KEY, token);
      this.saveMeta(meta);
      this.setStatus({ state: 'idle', login, lastSyncedAt: meta.lastSyncedAt });
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('server', String((e as Error)?.message ?? e));
      this.setStatus({ state: 'disconnected', error: err.message, errorCode: err.code }, true);
      throw err;
    }
    await this.sync('connect');
  }

  /** Forgets token and sync state on this device. The gist and local cards are kept. */
  disconnect() {
    this.kv.removeItem(TOKEN_KEY);
    this.kv.removeItem(META_KEY);
    this.setStatus({ state: 'disconnected' }, true);
  }

  /** Pull → merge → apply → push. Single-flight; a call during a sync queues one more run. Never throws. */
  sync(_reason = 'manual'): Promise<SyncResult | null> {
    if (!this.isConnected()) return Promise.resolve(null);
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      let result: SyncResult | null = null;
      do {
        this.again = false;
        result = await this.runOnce();
      } while (this.again);
      return result;
    })().finally(() => { this.running = null; });
    return this.running;
  }

  private async runOnce(): Promise<SyncResult | null> {
    const token = this.token();
    let meta = this.meta();
    if (!token || !meta.gistId) return null;
    this.setStatus({ state: 'syncing' });
    try {
      const c = this.client(token);
      let res: SyncResult = { pulled: false, pushed: false, localChanged: false };
      for (let attempt = 0; ; attempt++) {
        let remoteFile: GistFile | null;
        try {
          remoteFile = await c.getGist(meta.gistId!, meta.base ? meta.etag : undefined);
        } catch (e) {
          if (!(e instanceof SyncError) || e.code !== 'not-found') throw e;
          // Gist was deleted: find another or start fresh with a new one.
          const id = (await c.findGist()) ?? (await c.createGist(serializeSnapshot(await this.local.read(), this.now()))).id;
          meta = { ...meta, gistId: id, etag: undefined, base: undefined, tombstones: [] };
          this.saveMeta(meta);
          continue;
        }
        const remote = remoteFile ? parseSnapshotOrThrow(remoteFile.content) : null;
        const local = await this.local.read();
        local.tombstones = meta.tombstones;
        const merged = mergeSnapshots(local, remote, meta.base ?? null, this.now());
        const mergedHash = snapshotHash(merged);
        const remoteHash = remote ? snapshotHash(remote) : meta.base?.hash;
        let etag = remoteFile?.etag ?? meta.etag;
        let updatedAt = remoteFile?.updatedAt ?? meta.remoteUpdatedAt;
        if (mergedHash !== remoteHash) {
          // Don't clobber: if the gist moved since we read it, merge again.
          if (etag && attempt < 3) {
            const moved = await c.getGist(meta.gistId!, etag);
            if (moved) { meta = { ...meta, etag: undefined }; continue; }
          }
          const put = await c.updateGist(meta.gistId!, serializeSnapshot(merged, this.now()));
          etag = put.etag;
          updatedAt = put.updatedAt;
          res.pushed = true;
        }
        let skipped = false;
        if (localDataHash(merged) !== localDataHash(local)) {
          skipped = (await this.local.apply(local, merged)).skipped;
          res.localChanged = true;
        }
        res.pulled = !!remote;
        const now = this.now();
        meta = { ...meta, etag, remoteUpdatedAt: updatedAt, base: computeBase(merged), tombstones: merged.tombstones, lastSyncedAt: now, pending: false, retryAt: undefined };
        this.saveMeta(meta);
        this.setStatus({ state: 'idle', lastSyncedAt: now, error: undefined, errorCode: undefined });
        if (res.localChanged) await this.onLocalChange?.();
        if (skipped) this.again = true; // local edits raced with this sync; pick them up next round
        return res;
      }
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('server', (e as Error)?.message ?? String(e));
      const retryable = err.code === 'offline' || err.code === 'rate-limit' || err.code === 'server';
      this.saveMeta({ ...this.meta(), pending: retryable, retryAt: err.retryAt });
      this.setStatus(err.code === 'offline' ? { state: 'offline', error: undefined, errorCode: 'offline' } : { state: 'error', error: err.message, errorCode: err.code });
      return null;
    }
  }
}

function parseSnapshotOrThrow(text: string): Snapshot {
  try { return parseSnapshot(text); } catch (e) { throw new SyncError('bad-data', `The sync gist’s flashcards.json couldn’t be read: ${(e as Error).message}`); }
}

// ---------- IndexedDB-backed local store + app singleton ----------

const sameRow = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

export const idbLocalStore: LocalStore = {
  async read() {
    const [decks, cards, logs, settings] = await Promise.all([db.listDecks(), db.listCards(), db.listLogs(), db.getSettings()]);
    return { decks, cards, logs, settings: syncedSettings(settings), tombstones: [] };
  },
  async apply(prev, next) {
    const conn = await db.openDB();
    const tx = conn.transaction(['decks', 'cards', 'logs'], 'readwrite');
    const deckStore = tx.objectStore('decks');
    const cardStore = tx.objectStore('cards');
    const logStore = tx.objectStore('logs');
    let skipped = false;
    try {
      const prevCards = new Map(prev.cards.map((c) => [c.id, c]));
      const nextCards = new Map(next.cards.map((c) => [c.id, c]));
      // A row edited after `prev` was read wins over sync; it'll be merged on the next round.
      const untouched = async (id: ID) => {
        const cur = (await cardStore.get(id)) as Card | undefined;
        const p = prevCards.get(id);
        const ok = cur && p ? cur.updatedAt === p.updatedAt : !cur && !p;
        if (!ok) skipped = true;
        return ok;
      };
      // Decks: delete removed + changed first (unique `path` index), then put.
      const prevDecks = new Set(prev.decks.map((d) => d.id));
      const nextDecks = new Map(next.decks.map((d) => [d.id, d]));
      const curDecks = new Map(((await deckStore.getAll()) as Deck[]).map((d) => [d.id, d]));
      const nextPaths = new Set(next.decks.map((d) => d.path));
      for (const d of curDecks.values()) {
        const n = nextDecks.get(d.id);
        if (n ? !sameRow(n, d) : prevDecks.has(d.id) || nextPaths.has(d.path)) await deckStore.delete(d.id);
      }
      for (const d of next.decks) if (!sameRow(curDecks.get(d.id), d)) await deckStore.put(d);
      // Cards.
      for (const c of prev.cards) if (!nextCards.has(c.id) && (await untouched(c.id))) await cardStore.delete(c.id);
      for (const c of next.cards) if (!sameRow(prevCards.get(c.id), c) && (await untouched(c.id))) await cardStore.put(c);
      // Logs: append-only, except logs of deleted cards.
      const prevLogs = new Set(prev.logs.map((l) => l.id));
      const nextLogs = new Set(next.logs.map((l) => l.id));
      for (const l of prev.logs) if (!nextLogs.has(l.id) && !nextCards.has(l.cardId)) await logStore.delete(l.id);
      for (const l of next.logs) if (!prevLogs.has(l.id)) await logStore.put(l);
      await tx.done;
    } catch (e) {
      try { tx.abort(); } catch { /* finished */ }
      await tx.done.catch(() => {});
      throw e;
    }
    if (!sameRow(prev.settings, next.settings)) await db.saveSettings(next.settings);
    return { skipped };
  },
};

let engine: SyncEngine | null = null;
/** App-wide engine backed by IndexedDB + localStorage. */
export function getSyncEngine(): SyncEngine {
  return (engine ??= new SyncEngine(idbLocalStore));
}
