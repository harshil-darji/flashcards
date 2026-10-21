import { useMemo, useState } from 'react';
import type { Card, Deck } from '../../types';
import * as db from '../../core/db';
import { useStore } from '../store';
import type { DeckNode } from '../lib/decks';
import { isDue, isNew } from '../lib/decks';
import { plainPreview } from '../lib/markdown';
import { Page } from '../components/Page';
import { BarButton } from '../components/BarButton';
import { ListSection } from '../components/ListSection';
import { ListRow } from '../components/ListRow';
import { SwipeRow } from '../components/SwipeRow';
import { CountPills } from '../components/CountPills';
import { ActionSheet } from '../components/ActionSheet';
import { FilledButton } from '../components/FilledButton';
import { StatTile } from '../components/StatTile';
import { Icon } from '../components/Icon';

export function DeckDetail({ node, backLabel, onBack, onOpenDeck, onStudy, onEditCard, onAddCard, onNewSubdeck, onRename, onDeleteDeck, error }: {
  node: DeckNode;
  backLabel: string;
  onBack: () => void;
  onOpenDeck: (d: Deck) => void;
  onStudy: () => void;
  onEditCard: (c: Card) => void;
  onAddCard: () => void;
  onNewSubdeck: () => void;
  onRename: () => void;
  onDeleteDeck: (d: Deck) => void;
  error: string | null;
}) {
  const { cards, reload } = useStore();
  const [menu, setMenu] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const own = useMemo(
    () => cards.filter((c) => c.deckId === node.deck.id).sort((a, b) => a.createdAt - b.createdAt),
    [cards, node.deck.id],
  );
  const now = Date.now();
  const studyable = node.counts.due + node.counts.fresh;

  const deleteCard = async (c: Card) => {
    setCardError(null);
    try { await db.deleteCard(c.id); await reload(); } catch (e) { setCardError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <>
      <Page
        title={node.deck.name}
        leading={<BarButton icon="chevron-left" onClick={onBack}>{backLabel}</BarButton>}
        trailing={
          <>
            <BarButton icon="plus" label="Add card" onClick={onAddCard} />
            <BarButton icon="ellipsis" label="More" onClick={() => setMenu(true)} />
          </>
        }
      >
        {(error || cardError) && <div className="form-error">{error || cardError}</div>}
        <div className="stat-grid three">
          <StatTile label="New" value={node.counts.fresh} color="var(--blue)" />
          <StatTile label="Due" value={node.counts.due} color="var(--green)" />
          <StatTile label="Total" value={node.counts.total} />
        </div>
        <div className="page-actions">
          <FilledButton onClick={onStudy} disabled={studyable === 0}>
            {studyable ? 'Study Now' : 'Nothing Due'}
          </FilledButton>
        </div>

        {node.children.length > 0 && (
          <ListSection header="Sub-decks">
            {node.children.map((ch) => (
              <SwipeRow key={ch.deck.id} onDelete={() => onDeleteDeck(ch.deck)}>
                <ListRow
                  title={ch.deck.name}
                  subtitle={`${ch.counts.total} card${ch.counts.total === 1 ? '' : 's'}`}
                  accessory={<CountPills fresh={ch.counts.fresh} due={ch.counts.due} />}
                  chevron
                  onClick={() => onOpenDeck(ch.deck)}
                />
              </SwipeRow>
            ))}
          </ListSection>
        )}

        <ListSection header={`Cards (${own.length})`} footer={own.length ? 'Tap to edit. Swipe left to delete.' : undefined}>
          {own.map((c) => (
            <SwipeRow key={c.id} onDelete={() => deleteCard(c)}>
              <ListRow
                multiline
                title={plainPreview(c.front, 140) || 'Untitled'}
                subtitle={c.tags.length ? c.tags.join(' · ') : undefined}
                leading={<span className={`state-dot ${isNew(c) ? 'new' : isDue(c, now) ? 'due' : 'later'}`} />}
                chevron
                onClick={() => onEditCard(c)}
              />
            </SwipeRow>
          ))}
          <ListRow tint title="Add Card" leading={<Icon name="plus" size={20} />} onClick={onAddCard} />
        </ListSection>
      </Page>
      <ActionSheet
        open={menu}
        title={node.deck.path}
        actions={[
          { label: 'Add Card', onSelect: onAddCard },
          { label: 'New Sub-deck', onSelect: onNewSubdeck },
          { label: 'Rename Deck', onSelect: onRename },
          { label: 'Delete Deck', destructive: true, onSelect: () => onDeleteDeck(node.deck) },
        ]}
        onClose={() => setMenu(false)}
      />
    </>
  );
}
