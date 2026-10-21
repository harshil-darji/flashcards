import { useEffect, useMemo, useState } from 'react';
import type { Card, ID } from '../../types';
import * as db from '../../core/db';
import { newFsrsState } from '../../core/scheduler';
import { useStore } from '../store';
import { createDeckPath } from '../lib/deckOps';
import { Sheet } from './Sheet';
import { BarButton } from './BarButton';
import { ListSection } from './ListSection';
import { DeckPicker, NEW_DECK } from './DeckPicker';
import { TagInput } from './TagInput';
import { SegmentedControl } from './SegmentedControl';
import { Markdown } from './Markdown';
import { ActionSheet } from './ActionSheet';
import { PromptDialog } from './PromptDialog';

export type EditorTarget = { card: Card } | { deckId?: ID } | null;

/** Add / edit / delete a card. `target` null = closed; `{card}` = edit; `{deckId}` = new card. */
export function CardEditorSheet({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const { decks, cards, reload } = useStore();
  const editing = target && 'card' in target ? target.card : null;
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deckId, setDeckId] = useState<ID | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDeckPrompt, setNewDeckPrompt] = useState(false);

  useEffect(() => {
    if (!target) return;
    const c = 'card' in target ? target.card : null;
    setFront(c?.front ?? '');
    setBack(c?.back ?? '');
    setTags(c?.tags ?? []);
    const preset = 'deckId' in target ? target.deckId : undefined;
    setDeckId(c?.deckId ?? preset ?? decks[0]?.id ?? '');
    setMode('edit');
    setError(null);
    setSaving(false);
  }, [target]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) for (const t of c.tags) s.add(t);
    return [...s].sort();
  }, [cards]);

  const canSave = front.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      let targetDeck = deckId;
      if (!targetDeck) targetDeck = await createDeckPath('Default', decks);
      const now = Date.now();
      const card: Card = editing
        ? { ...editing, front, back, tags, deckId: targetDeck, updatedAt: now }
        : { id: crypto.randomUUID(), deckId: targetDeck, front, back, tags, createdAt: now, updatedAt: now, fsrs: newFsrsState(new Date(now)) };
      await db.putCard(card);
      await reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await db.deleteCard(editing.id);
      await reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Sheet
        open={!!target}
        onClose={onClose}
        title={editing ? 'Edit Card' : 'New Card'}
        leading={<BarButton onClick={onClose}>Cancel</BarButton>}
        trailing={<BarButton onClick={save} bold disabled={!canSave}>{editing ? 'Save' : 'Add'}</BarButton>}
      >
        <div className="editor">
          <SegmentedControl
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }]}
          />
          {mode === 'edit' ? (
            <>
              <ListSection header="Front" footer="Markdown. Use ```java fences for code.">
                <textarea className="md-input" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question" rows={4} autoCapitalize="sentences" />
              </ListSection>
              <ListSection header="Back">
                <textarea className="md-input tall" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Answer" rows={8} autoCapitalize="sentences" />
              </ListSection>
            </>
          ) : (
            <>
              <ListSection header="Front"><div className="md-preview"><Markdown source={front || '_Empty_'} /></div></ListSection>
              <ListSection header="Back"><div className="md-preview"><Markdown source={back || '_Empty_'} /></div></ListSection>
            </>
          )}
          <ListSection header="Deck">
            <div className="list-row">
              <span className="list-row-main"><span className="list-row-title">Deck</span></span>
              <DeckPicker decks={decks} value={deckId} onChange={(id) => (id === NEW_DECK ? setNewDeckPrompt(true) : setDeckId(id))} />
            </div>
          </ListSection>
          <ListSection header="Tags">
            <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
          </ListSection>
          {error && <div className="form-error">{error}</div>}
          {editing && (
            <ListSection>
              <button type="button" className="list-row tappable destructive center" onClick={() => setConfirmDelete(true)}>Delete Card</button>
            </ListSection>
          )}
        </div>
      </Sheet>
      <ActionSheet
        open={confirmDelete}
        message="This card and its review history will be deleted."
        actions={[{ label: 'Delete Card', destructive: true, onSelect: remove }]}
        onClose={() => setConfirmDelete(false)}
      />
      <PromptDialog
        open={newDeckPrompt}
        title="New Deck"
        message="Use :: for sub-decks, e.g. LeetCode::Graphs"
        placeholder="Deck name"
        confirmLabel="Create"
        validate={(v) => (decks.some((d) => d.path.toLowerCase() === v.toLowerCase()) ? 'A deck with that name exists.' : null)}
        onCancel={() => setNewDeckPrompt(false)}
        onSubmit={async (name) => {
          setNewDeckPrompt(false);
          try {
            const id = await createDeckPath(name, decks);
            await reload();
            setDeckId(id);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </>
  );
}
