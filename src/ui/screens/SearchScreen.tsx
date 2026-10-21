import { useEffect, useMemo, useState } from 'react';
import type { Card, ID } from '../../types';
import { searchCards } from '../../core/db';
import { useStore } from '../store';
import { sortedDecks } from '../lib/decks';
import { plainPreview } from '../lib/markdown';
import { Page } from '../components/Page';
import { SearchBar } from '../components/SearchBar';
import { ChipRow } from '../components/ChipRow';
import { Chip } from '../components/Chip';
import { ListSection } from '../components/ListSection';
import { ListRow } from '../components/ListRow';
import { EmptyState } from '../components/EmptyState';
import { CardEditorSheet, type EditorTarget } from '../components/CardEditorSheet';

export default function SearchScreen() {
  const { decks, cards, version } = useStore();
  const [query, setQuery] = useState('');
  const [deckId, setDeckId] = useState<ID | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget>(null);

  const deckOptions = useMemo(() => sortedDecks(decks), [decks]);
  const pathById = useMemo(() => new Map(decks.map((d) => [d.id, d.path])), [decks]);
  const allTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of cards) for (const t of c.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [cards]);

  const active = query.trim() !== '' || deckId !== null || tags.length > 0;

  useEffect(() => {
    if (!active) { setResults(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchCards(query.trim(), { deckId: deckId ?? undefined, tags: tags.length ? tags : undefined });
        if (!cancelled) { setResults(r); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, deckId, tags, active, version]);

  const toggleTag = (t: string) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  return (
    <>
      <Page title="Search">
        <SearchBar value={query} onChange={setQuery} placeholder="Front, back or tag" />
        {deckOptions.length > 0 && (
          <ChipRow label="Deck">
            <Chip selected={deckId === null} onClick={() => setDeckId(null)}>All</Chip>
            {deckOptions.map((d) => (
              <Chip key={d.id} selected={deckId === d.id} onClick={() => setDeckId(deckId === d.id ? null : d.id)}>{d.path.split('::').join(' › ')}</Chip>
            ))}
          </ChipRow>
        )}
        {allTags.length > 0 && (
          <ChipRow label="Tags">
            {allTags.map((t) => <Chip key={t} selected={tags.includes(t)} onClick={() => toggleTag(t)}>#{t}</Chip>)}
          </ChipRow>
        )}
        {error && <div className="form-error">{error}</div>}
        {!active ? (
          <EmptyState title="Search Cards" message={`Search across ${cards.length} card${cards.length === 1 ? '' : 's'} by text, deck, or tag.`} />
        ) : results === null ? null : results.length === 0 ? (
          <EmptyState title="No Results" message="Try a different search or fewer filters." />
        ) : (
          <ListSection header={`${results.length} result${results.length === 1 ? '' : 's'}`}>
            {results.slice(0, 300).map((c) => (
              <ListRow
                key={c.id}
                multiline
                title={plainPreview(c.front, 140) || 'Untitled'}
                subtitle={[pathById.get(c.deckId), c.tags.map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · ')}
                chevron
                onClick={() => setEditor({ card: c })}
              />
            ))}
          </ListSection>
        )}
      </Page>
      <CardEditorSheet target={editor} onClose={() => setEditor(null)} />
    </>
  );
}
