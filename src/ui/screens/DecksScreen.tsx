import { useMemo, useState } from 'react';
import type { Deck, ID } from '../../types';
import * as db from '../../core/db';
import { useStore } from '../store';
import { buildTree, findNode, subtreeIds } from '../lib/decks';
import { createDeckPath, childPath, renameDeck } from '../lib/deckOps';
import { Page } from '../components/Page';
import { BarButton } from '../components/BarButton';
import { ListSection } from '../components/ListSection';
import { DeckTreeRows } from '../components/DeckTreeRows';
import { ActionSheet } from '../components/ActionSheet';
import { PromptDialog } from '../components/PromptDialog';
import { CardEditorSheet, type EditorTarget } from '../components/CardEditorSheet';
import { EmptyState } from '../components/EmptyState';
import { FilledButton } from '../components/FilledButton';
import { DeckDetail } from './DeckDetail';

type Prompt = { kind: 'create'; parent: Deck | null } | { kind: 'rename'; deck: Deck } | null;

export default function DecksScreen({ onStudy }: { onStudy: (deckId?: ID) => void }) {
  const { decks, cards, reload, ready } = useStore();
  const [openId, setOpenId] = useState<ID | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [toDelete, setToDelete] = useState<Deck | null>(null);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(decks, cards), [decks, cards]);
  const openNode = openId ? findNode(tree, openId) : undefined;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const confirmDelete = (deck: Deck) => setToDelete(deck);
  const deleteCount = toDelete ? findNode(tree, toDelete.id)?.counts.total ?? 0 : 0;

  const shared = (
    <>
      <PromptDialog
        open={!!prompt}
        title={prompt?.kind === 'rename' ? 'Rename Deck' : prompt?.parent ? `New Sub-deck in “${prompt.parent.name}”` : 'New Deck'}
        message={prompt?.kind === 'create' && !prompt.parent ? 'Use :: for nesting, e.g. LeetCode::Graphs' : undefined}
        initialValue={prompt?.kind === 'rename' ? prompt.deck.name : ''}
        placeholder="Deck name"
        confirmLabel={prompt?.kind === 'rename' ? 'Rename' : 'Create'}
        validate={(v) => {
          if (!prompt) return null;
          const path = prompt.kind === 'rename'
            ? childPath(decks.find((d) => d.id === prompt.deck.parentId) ?? null, v.split('::').join(' '))
            : childPath(prompt.parent, v);
          const clash = decks.find((d) => d.path === path);
          return clash && !(prompt.kind === 'rename' && clash.id === prompt.deck.id) ? 'A deck with that name already exists.' : null;
        }}
        onCancel={() => setPrompt(null)}
        onSubmit={(v) => {
          const p = prompt;
          setPrompt(null);
          if (!p) return;
          if (p.kind === 'rename') run(() => renameDeck(p.deck, v, decks));
          else run(() => createDeckPath(childPath(p.parent, v), decks));
        }}
      />
      <ActionSheet
        open={!!toDelete}
        title={toDelete ? `Delete “${toDelete.name}”?` : undefined}
        message={`This deletes the deck, its sub-decks and ${deleteCount} card${deleteCount === 1 ? '' : 's'}. This can’t be undone.`}
        actions={[{
          label: 'Delete Deck',
          destructive: true,
          onSelect: () => {
            const d = toDelete!;
            if (openId && subtreeIds(d.id, decks).has(openId)) setOpenId(d.parentId);
            run(() => db.deleteDeck(d.id));
          },
        }]}
        onClose={() => setToDelete(null)}
      />
      <CardEditorSheet target={editor} onClose={() => setEditor(null)} />
    </>
  );

  if (openNode) {
    const parent = openNode.deck.parentId ? decks.find((d) => d.id === openNode.deck.parentId) : undefined;
    return (
      <>
        <DeckDetail
          key={openNode.deck.id}
          node={openNode}
          backLabel={parent?.name ?? 'Decks'}
          onBack={() => setOpenId(parent?.id ?? null)}
          onOpenDeck={(d) => setOpenId(d.id)}
          onStudy={() => onStudy(openNode.deck.id)}
          onEditCard={(card) => setEditor({ card })}
          onAddCard={() => setEditor({ deckId: openNode.deck.id })}
          onNewSubdeck={() => setPrompt({ kind: 'create', parent: openNode.deck })}
          onRename={() => setPrompt({ kind: 'rename', deck: openNode.deck })}
          onDeleteDeck={confirmDelete}
          error={error}
        />
        {shared}
      </>
    );
  }

  return (
    <>
      <Page title="Decks" trailing={<BarButton icon="plus" label="Add" onClick={() => setAddMenu(true)} />}>
        {error && <div className="form-error">{error}</div>}
        {ready && tree.length === 0 ? (
          <EmptyState
            title="No Decks Yet"
            message="Create a deck, or import cards from Settings."
            action={<FilledButton onClick={() => setPrompt({ kind: 'create', parent: null })}>New Deck</FilledButton>}
          />
        ) : (
          <>
            <ListSection footer={tree.length ? 'Blue: new · Green: due. Swipe left to delete.' : undefined}>
              <DeckTreeRows nodes={tree} onOpen={(d) => setOpenId(d.id)} onDelete={confirmDelete} />
            </ListSection>
            {tree.length > 0 && (
              <div className="page-actions">
                <FilledButton onClick={() => onStudy()}>Study All Due</FilledButton>
              </div>
            )}
          </>
        )}
      </Page>
      <ActionSheet
        open={addMenu}
        actions={[
          { label: 'New Card', onSelect: () => setEditor({}) },
          { label: 'New Deck', onSelect: () => setPrompt({ kind: 'create', parent: null }) },
        ]}
        onClose={() => setAddMenu(false)}
      />
      {shared}
    </>
  );
}
