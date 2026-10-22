import { useState } from 'react';
import type { Deck, ID } from '../../types';
import type { Progress } from '../../core/progress';
import type { DeckNode } from '../lib/decks';
import { ListRow } from './ListRow';
import { SwipeRow } from './SwipeRow';
import { CountPills } from './CountPills';
import { Icon } from './Icon';
import { DeckRowSubtitle } from './decks/DeckRowSubtitle';

/** Flattened, collapsible deck tree as list rows (swipe left to delete). */
export function DeckTreeRows({ nodes, onOpen, onDelete, progress }: {
  nodes: DeckNode[];
  onOpen: (d: Deck) => void;
  onDelete: (d: Deck) => void;
  /** Mastery per deck (incl. descendants); shows a progress bar under each row when given. */
  progress?: Map<ID, Progress>;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const rows: React.JSX.Element[] = [];
  const walk = (list: DeckNode[]) => {
    for (const node of list) {
      const hasKids = node.children.length > 0;
      const isCollapsed = collapsed.has(node.deck.id);
      rows.push(
        <SwipeRow key={node.deck.id} onDelete={() => onDelete(node.deck)}>
          <ListRow
            indent={node.depth}
            title={node.deck.name}
            subtitle={<DeckRowSubtitle total={node.counts.total} progress={progress?.get(node.deck.id)} />}
            onClick={() => onOpen(node.deck)}
            leading={
              hasKids ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  className={`disclosure${isCollapsed ? '' : ' open'}`}
                  onClick={(e) => { e.stopPropagation(); toggle(node.deck.id); }}
                >
                  <Icon name="chevron-right" size={14} strokeWidth={3} />
                </span>
              ) : (
                <span className="disclosure-spacer" />
              )
            }
            accessory={<CountPills fresh={node.counts.fresh} due={node.counts.due} />}
            chevron
          />
        </SwipeRow>,
      );
      if (hasKids && !isCollapsed) walk(node.children);
    }
  };
  walk(nodes);
  return <>{rows}</>;
}
