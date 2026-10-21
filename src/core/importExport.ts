/**
 * Public import/export contract. See docs/IMPORT_FORMAT.md.
 * Pure functions only (no IndexedDB); db.importCards persists a ParseResult.
 */
import { createEmptyCard, State } from 'ts-fsrs';
import type { Card, Deck, FsrsState, ID } from '../types';

export const JSON_FORMAT_VERSION = 1;
export const CSV_HEADER = ['front', 'back', 'deck', 'tags'] as const;
export const DECK_SEPARATOR = '::';
export const TAG_SEPARATOR = ';';
export const DEFAULT_DECK = 'Default';

/** A card as it appears in an import file, before deck ids are assigned. */
export interface ImportedCard {
  id?: ID;
  front: string;
  back: string;
  /** Normalized deck path, e.g. "LeetCode::Two Pointers". */
  deck: string;
  tags: string[];
  fsrs?: FsrsState;
}

export interface ParseError {
  /** 1-based data row (CSV, excluding header) or 1-based array index (JSON); 0 = whole file. */
  row: number;
  message: string;
}

export interface ParseResult {
  cards: ImportedCard[];
  errors: ParseError[];
}

export interface ExportJSONOptions {
  /** Include `id` and `fsrs` (full backup). Default true. */
  includeScheduling?: boolean;
}

// ---------- helpers ----------

/** Trims segments, drops empty ones, joins with "::". Empty → "Default". */
export function normalizeDeckPath(path: string | undefined | null): string {
  const parts = String(path ?? '')
    .split(DECK_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts.join(DECK_SEPARATOR) : DEFAULT_DECK;
}

/** "a; b;;a" → ["a","b"]. Arrays are also accepted (each item trimmed). */
export function parseTags(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(TAG_SEPARATOR)
      : [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const s = t.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const STATE_NAMES: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function toDate(v: unknown): Date | undefined {
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/** Revives a serialized FSRS state (ISO dates, numeric or named state). Throws on invalid input. */
export function reviveFsrs(v: unknown): FsrsState {
  if (!v || typeof v !== 'object') throw new Error('fsrs must be an object');
  const o = v as Record<string, unknown>;
  const due = toDate(o.due);
  if (!due) throw new Error('fsrs.due must be a valid date');
  const num = (k: string, def?: number): number => {
    const x = o[k];
    if (x === undefined && def !== undefined) return def;
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`fsrs.${k} must be a number`);
    return x;
  };
  let state: State;
  if (typeof o.state === 'number' && o.state in State) state = o.state as State;
  else if (typeof o.state === 'string' && o.state.toLowerCase() in STATE_NAMES) state = STATE_NAMES[o.state.toLowerCase()];
  else throw new Error('fsrs.state must be 0-3 or New|Learning|Review|Relearning');
  const out: FsrsState = {
    due,
    stability: num('stability'),
    difficulty: num('difficulty'),
    elapsed_days: num('elapsed_days', 0),
    scheduled_days: num('scheduled_days', 0),
    learning_steps: num('learning_steps', 0),
    reps: num('reps', 0),
    lapses: num('lapses', 0),
    state,
  };
  if (o.last_review !== undefined && o.last_review !== null) {
    const lr = toDate(o.last_review);
    if (!lr) throw new Error('fsrs.last_review must be a valid date');
    out.last_review = lr;
  }
  return out;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
}

// ---------- JSON ----------

/** Accepts `{"version":1,"cards":[...]}` or a bare array of card objects. */
export function parseJSON(text: string): ParseResult {
  const errors: ParseError[] = [];
  const cards: ImportedCard[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    return { cards, errors: [{ row: 0, message: `Invalid JSON: ${(e as Error).message}` }] };
  }
  let list: unknown;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (o.version !== undefined && o.version !== JSON_FORMAT_VERSION) {
      return { cards, errors: [{ row: 0, message: `Unsupported version ${String(o.version)} (expected ${JSON_FORMAT_VERSION})` }] };
    }
    list = o.cards;
  }
  if (!Array.isArray(list)) {
    return { cards, errors: [{ row: 0, message: 'Expected {"version":1,"cards":[...]} or an array of cards' }] };
  }
  list.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ row, message: 'Card must be an object' });
      return;
    }
    const o = item as Record<string, unknown>;
    const front = str(o.front);
    const back = str(o.back);
    if (!front || !front.trim()) return void errors.push({ row, message: 'Missing "front"' });
    if (back === undefined) return void errors.push({ row, message: 'Missing "back"' });
    const card: ImportedCard = { front, back, deck: normalizeDeckPath(str(o.deck)), tags: parseTags(o.tags) };
    const id = str(o.id);
    if (id && id.trim()) card.id = id.trim();
    if (o.fsrs !== undefined && o.fsrs !== null) {
      try {
        card.fsrs = reviveFsrs(o.fsrs);
      } catch (e) {
        return void errors.push({ row, message: (e as Error).message });
      }
    }
    cards.push(card);
  });
  return { cards, errors };
}

function deckPathMap(decks: Deck[]): Map<ID, string> {
  return new Map(decks.map((d) => [d.id, d.path]));
}

export function exportJSON(cards: Card[], decks: Deck[], opts: ExportJSONOptions = {}): string {
  const full = opts.includeScheduling ?? true;
  const paths = deckPathMap(decks);
  const out = cards.map((c) => {
    const o: Record<string, unknown> = {};
    if (full) o.id = c.id;
    o.front = c.front;
    o.back = c.back;
    o.deck = paths.get(c.deckId) ?? DEFAULT_DECK;
    o.tags = c.tags;
    if (full) o.fsrs = c.fsrs;
    return o;
  });
  return JSON.stringify({ version: JSON_FORMAT_VERSION, cards: out }, null, 2);
}

// ---------- CSV (RFC 4180) ----------

/** Splits CSV text into rows of fields. Handles quoted fields, "" escapes, CRLF/LF, BOM. */
export function parseCSVRows(text: string): { rows: string[][]; error?: string } {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  let quotedField = false;
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '' && !quotedField) {
      inQuotes = true;
      quotedField = true;
      i++;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      quotedField = false;
      i++;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      quotedField = false;
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (inQuotes) return { rows, error: 'Unterminated quoted field' };
  if (field !== '' || row.length || quotedField) {
    row.push(field);
    rows.push(row);
  }
  return { rows };
}

/** Header row required (case-insensitive, any order): front, back, and optionally deck, tags. Extra columns ignored. */
export function parseCSV(text: string): ParseResult {
  const cards: ImportedCard[] = [];
  const errors: ParseError[] = [];
  const { rows, error } = parseCSVRows(text);
  if (error) return { cards, errors: [{ row: 0, message: error }] };
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (!nonEmpty.length) return { cards, errors: [{ row: 0, message: 'Empty CSV' }] };
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iFront = col('front');
  const iBack = col('back');
  const iDeck = col('deck');
  const iTags = col('tags');
  if (iFront < 0 || iBack < 0) {
    return { cards, errors: [{ row: 0, message: 'Header must include "front" and "back" (expected: front,back,deck,tags)' }] };
  }
  nonEmpty.slice(1).forEach((r, idx) => {
    const row = idx + 1;
    const get = (i: number) => (i >= 0 && i < r.length ? r[i] : '');
    const front = get(iFront);
    if (!front.trim()) return void errors.push({ row, message: 'Missing "front"' });
    if (iBack >= r.length) return void errors.push({ row, message: 'Missing "back" column' });
    cards.push({
      front,
      back: get(iBack),
      deck: normalizeDeckPath(get(iDeck)),
      tags: parseTags(get(iTags)),
    });
  });
  return { cards, errors };
}

export function csvEscape(v: string): string {
  return /[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Header `front,back,deck,tags`, CRLF line endings, tags joined by ";". Scheduling is not included. */
export function exportCSV(cards: Card[], decks: Deck[]): string {
  const paths = deckPathMap(decks);
  const lines = [CSV_HEADER.join(',')];
  for (const c of cards) {
    const tags = c.tags.map((t) => t.split(TAG_SEPARATOR).join(' ').trim()).filter(Boolean).join(TAG_SEPARATOR);
    lines.push([c.front, c.back, paths.get(c.deckId) ?? DEFAULT_DECK, tags].map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

// ---------- materialize ----------

const defaultId = (): ID => crypto.randomUUID();

/**
 * Ensures a Deck exists for every path (and every ancestor, e.g. "A" for "A::B").
 * Returns only newly created decks plus a path→id map covering existing and new decks.
 */
export function resolveDecks(
  paths: Iterable<string>,
  existing: Deck[],
  now: number = Date.now(),
  genId: () => ID = defaultId,
): { created: Deck[]; deckIdByPath: Map<string, ID> } {
  const deckIdByPath = new Map(existing.map((d) => [d.path, d.id]));
  const created: Deck[] = [];
  for (const p of paths) {
    const parts = normalizeDeckPath(p).split(DECK_SEPARATOR);
    let parentId: ID | null = null;
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join(DECK_SEPARATOR);
      let id = deckIdByPath.get(path);
      if (!id) {
        id = genId();
        created.push({ id, name: parts[i], path, parentId, createdAt: now, updatedAt: now });
        deckIdByPath.set(path, id);
      }
      parentId = id;
    }
  }
  return { created, deckIdByPath };
}

/** Converts parsed cards to full Cards: assigns deck ids, keeps `id`/`fsrs` if present, else new id + empty FSRS state. */
export function materialize(
  result: ParseResult,
  existingDecks: Deck[],
  now: number = Date.now(),
  genId: () => ID = defaultId,
): { decks: Deck[]; cards: Card[] } {
  const { created, deckIdByPath } = resolveDecks(
    result.cards.map((c) => c.deck),
    existingDecks,
    now,
    genId,
  );
  const cards = result.cards.map<Card>((c) => ({
    id: c.id ?? genId(),
    deckId: deckIdByPath.get(normalizeDeckPath(c.deck))!,
    front: c.front,
    back: c.back,
    tags: c.tags,
    createdAt: now,
    updatedAt: now,
    fsrs: c.fsrs ?? createEmptyCard(new Date(now)),
  }));
  return { decks: created, cards };
}
