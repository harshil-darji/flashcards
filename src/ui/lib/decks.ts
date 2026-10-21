import { State } from 'ts-fsrs';
import type { Card, Deck, ID } from '../../types';

export interface DeckCounts { due: number; fresh: number; total: number }
export interface DeckNode { deck: Deck; depth: number; children: DeckNode[]; counts: DeckCounts }

export const isNew = (c: Card) => c.fsrs.state === State.New;
export const isDue = (c: Card, now: number) => !isNew(c) && new Date(c.fsrs.due).getTime() <= now;

/** Ids of `deckId` and all descendants. */
export function subtreeIds(deckId: ID, decks: Deck[]): Set<ID> {
  const ids = new Set<ID>([deckId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of decks) if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) { ids.add(d.id); grew = true; }
  }
  return ids;
}

export interface DailyLimits { newLeft: number; reviewsLeft: number }

/** Builds the deck tree. `fresh`/`due` are capped by today's remaining limits (like Anki); `total` is not. */
export function buildTree(decks: Deck[], cards: Card[], now = Date.now(), limits?: DailyLimits): DeckNode[] {
  const tree = buildRawTree(decks, cards, now);
  if (!limits) return tree;
  const cap = (ns: DeckNode[]) => ns.forEach((n) => {
    n.counts.fresh = Math.min(n.counts.fresh, limits.newLeft);
    n.counts.due = Math.min(n.counts.due, limits.reviewsLeft);
    cap(n.children);
  });
  cap(tree);
  return tree;
}

function buildRawTree(decks: Deck[], cards: Card[], now: number): DeckNode[] {
  const own = new Map<ID, DeckCounts>();
  for (const c of cards) {
    const k = own.get(c.deckId) ?? { due: 0, fresh: 0, total: 0 };
    k.total++;
    if (isNew(c)) k.fresh++;
    else if (isDue(c, now)) k.due++;
    own.set(c.deckId, k);
  }
  const byParent = new Map<ID | null, Deck[]>();
  const ids = new Set(decks.map((d) => d.id));
  for (const d of decks) {
    const p = d.parentId && ids.has(d.parentId) ? d.parentId : null;
    byParent.set(p, [...(byParent.get(p) ?? []), d]);
  }
  const make = (parent: ID | null, depth: number): DeckNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((deck) => {
        const children = make(deck.id, depth + 1);
        const counts = { ...(own.get(deck.id) ?? { due: 0, fresh: 0, total: 0 }) };
        for (const ch of children) {
          counts.due += ch.counts.due;
          counts.fresh += ch.counts.fresh;
          counts.total += ch.counts.total;
        }
        return { deck, depth, children, counts };
      });
  return make(null, 0);
}

export function findNode(nodes: DeckNode[], id: ID): DeckNode | undefined {
  for (const n of nodes) {
    if (n.deck.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return undefined;
}

export function sortedDecks(decks: Deck[]): Deck[] {
  return [...decks].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}
