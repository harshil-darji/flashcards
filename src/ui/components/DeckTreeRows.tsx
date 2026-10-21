import { useState } from 'react';
import type { Deck } from '../../types';
import type { DeckNode } from '../lib/decks';
import { ListRow } from './ListRow';
import { SwipeRow } from './SwipeRow';
import { CountPills } from './CountPills';
import { Icon } from './Icon';

/** Flattened, collapsible deck tree as list rows (swipe left to delete). */
export function DeckTreeRows({ nodes, onOpen, onDelete }: { nodes: DeckNode[]; onOpen: (d: Deck) => void; onDelete: (d: Deck) => void }) {
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
            subtitle={`${node.counts.total} card${node.counts.total === 1 ? '' : 's'}`}
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
