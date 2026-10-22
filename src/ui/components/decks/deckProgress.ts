import type { Card, ID } from '../../../types';
import { progressOf, type Progress } from '../../../core/progress';
import type { DeckNode } from '../../lib/decks';

/** Mastery progress for every node in the tree, over the deck and all its descendants. */
export function progressByDeck(nodes: DeckNode[], cards: Card[]): Map<ID, Progress> {
  const own = new Map<ID, Card[]>();
  for (const c of cards) own.set(c.deckId, [...(own.get(c.deckId) ?? []), c]);
  const out = new Map<ID, Progress>();
  const walk = (n: DeckNode): Card[] => {
    const all = [...(own.get(n.deck.id) ?? []), ...n.children.flatMap(walk)];
    out.set(n.deck.id, progressOf(all));
    return all;
  };
  nodes.forEach(walk);
  return out;
}
