import { materialize, normalizeDeckPath, parseJSON, type ImportedCard, type ParseResult } from '../core/importExport';
import { getSettings, openDB, saveSettings } from '../core/db';
import { hashString, hashValue } from '../core/hash';
import type { Card, Deck, ID, ReviewLog, SeedFileRecord, Settings } from '../types';

/** Every src/seed/*.json, as raw text (format: docs/IMPORT_FORMAT.md JSON). */
const seedFiles = import.meta.glob('./*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function parseSeeds(files: Record<string, string> = seedFiles): { file: string; result: ParseResult }[] {
  return Object.keys(files)
    .sort()
    .map((file) => ({ file, result: parseJSON(files[file]) }));
}

/** Stable id for a seed card without an explicit `id`, so every device derives the same id (needed for sync). */
export const seedCardId = (deck: string, front: string) => `seed-${hashString(`${normalizeDeckPath(deck)}\n${front.trim()}`)}`;

/** Hash of the user-visible content of a card, keyed by deck path (ids differ across devices). */
export const seedContentHash = (c: { front: string; back: string; tags: string[] }, deckPath: string) =>
  hashValue({ f: c.front, b: c.back, t: c.tags, d: normalizeDeckPath(deckPath) });

/** Parsed seed cards with ids filled in (explicit `id` wins; duplicates within a file get a suffix). */
export function seedCardsWithIds(cards: ImportedCard[]): (ImportedCard & { id: ID })[] {
  const seen = new Set<ID>();
  return cards.map((c) => {
    let id = c.id ?? seedCardId(c.deck, c.front);
    for (let n = 2; seen.has(id); n++) id = `${c.id ?? seedCardId(c.deck, c.front)}-${n}`;
    seen.add(id);
    return { ...c, id };
  });
}

export interface SeedPlan {
  insert: Card[];
  /** Existing cards whose content is replaced by the seed (scheduling, createdAt kept). */
  update: Card[];
  /** Legacy (pre-versioning) cards matched by deck+front, moved to their stable seed id (review logs follow). */
  rekey: { from: ID; card: Card }[];
  decks: Deck[];
  record: SeedFileRecord;
}

/**
 * Decides what one seed file changes. Pure.
 * - New card id → inserted (unless the previous version of this file had it, i.e. the user deleted it).
 * - Existing card → content updated only if the user hasn't edited it since the last import; FSRS state is never touched.
 * - `legacy` (installed before seed versioning): existing cards with the same deck+front are re-keyed to the stable id.
 */
export function planSeedFile(
  result: ParseResult,
  prev: SeedFileRecord | undefined,
  existingCards: Card[],
  existingDecks: Deck[],
  opts: { fileHash: string; legacy: boolean; now: number },
): SeedPlan {
  const { now } = opts;
  const seeds = seedCardsWithIds(result.cards);
  const { decks, cards: fresh } = materialize({ cards: seeds, errors: [] }, existingDecks, now);
  const allDecks = [...existingDecks, ...decks];
  const pathOf = new Map(allDecks.map((d) => [d.id, d.path]));
  const byId = new Map(existingCards.map((c) => [c.id, c]));
  const legacyByKey = new Map<string, Card>();
  if (opts.legacy) for (const c of existingCards) if (!c.id.startsWith('seed-')) legacyByKey.set(`${pathOf.get(c.deckId)}\n${c.front.trim()}`, c);

  const plan: SeedPlan = { insert: [], update: [], rekey: [], decks, record: { hash: opts.fileHash, cards: {}, importedAt: now } };
  seeds.forEach((s, i) => {
    const card = fresh[i];
    const newHash = seedContentHash(s, s.deck);
    plan.record.cards[s.id] = newHash;
    const cur = byId.get(s.id);
    if (!cur) {
      const old = legacyByKey.get(`${normalizeDeckPath(s.deck)}\n${s.front.trim()}`);
      if (old) {
        legacyByKey.delete(`${normalizeDeckPath(s.deck)}\n${s.front.trim()}`);
        // Content is kept as-is: we can't tell a pre-versioning edit from an older seed.
        plan.rekey.push({ from: old.id, card: { ...old, id: s.id } });
      } else if (!(prev && s.id in prev.cards)) plan.insert.push(card);
      return;
    }
    const curHash = seedContentHash(cur, pathOf.get(cur.deckId) ?? '');
    if (curHash === newHash) return;
    const prevHash = prev?.cards[s.id];
    if (prevHash !== undefined && prevHash === curHash) {
      plan.update.push({ ...cur, front: card.front, back: card.back, tags: card.tags, deckId: card.deckId, updatedAt: now });
    }
  });
  return plan;
}

/**
 * Imports seed files that are new or changed since they were last imported (tracked per file by content hash in
 * settings.seedVersions). Upserts by card id and never touches review state of existing cards.
 * Returns the number of cards inserted.
 */
export async function loadSeed(files: Record<string, string> = seedFiles): Promise<number> {
  const settings: Settings = await getSettings();
  const versions: Record<string, SeedFileRecord> = { ...(settings.seedVersions ?? {}) };
  const legacy = settings.seeded && !settings.seedVersions;
  let inserted = 0;
  let changed = !settings.seedVersions;
  for (const { file, result } of parseSeeds(files)) {
    const fileHash = hashString(files[file]);
    if (versions[file]?.hash === fileHash) continue;
    if (result.errors.length) console.warn(`[seed] ${file}:`, result.errors);
    const conn = await openDB();
    const tx = conn.transaction(['decks', 'cards', 'logs'], 'readwrite');
    const deckStore = tx.objectStore('decks');
    const cardStore = tx.objectStore('cards');
    const logStore = tx.objectStore('logs');
    const plan = planSeedFile(result, versions[file], (await cardStore.getAll()) as Card[], (await deckStore.getAll()) as Deck[], {
      fileHash, legacy, now: Date.now(),
    });
    for (const d of plan.decks) await deckStore.put(d);
    for (const c of [...plan.insert, ...plan.update]) await cardStore.put(c);
    for (const { from, card } of plan.rekey) {
      await cardStore.delete(from);
      await cardStore.put(card);
      for (const l of (await logStore.index('cardId').getAll(from)) as ReviewLog[]) await logStore.put({ ...l, cardId: card.id });
    }
    await tx.done;
    inserted += plan.insert.length;
    versions[file] = plan.record;
    changed = true;
  }
  if (changed || !settings.seeded) await saveSettings({ seeded: true, seedVersions: versions });
  return inserted;
}
