import { useCallback, useEffect, useMemo, useState } from 'react';
import { State } from 'ts-fsrs';
import type { Card, ID, Rating } from '../../types';
import { Rating as R } from '../../types';
import * as db from '../../core/db';
import { dueCards, previewIntervals, review } from '../../core/scheduler';
import { useStore } from '../store';
import { buildTree, isNew } from '../lib/decks';
import { studyDayStart } from '../lib/dates';
import { Page } from '../components/Page';
import { BarButton } from '../components/BarButton';
import { ListSection } from '../components/ListSection';
import { ListRow } from '../components/ListRow';
import { CountPills } from '../components/CountPills';
import { ReviewCard, type SwipeDir } from '../components/ReviewCard';
import { RatingButtons } from '../components/RatingButtons';
import { FilledButton } from '../components/FilledButton';
import { EmptyState } from '../components/EmptyState';
import { CardEditorSheet, type EditorTarget } from '../components/CardEditorSheet';

/** Cards rated into a short learning step come back in the same session. */
const LEARN_AHEAD_MS = 20 * 60 * 1000;

type Session = { deckId?: ID } | null;

export default function ReviewScreen({ deckId, startNow, onExit }: { deckId?: ID | null; startNow?: boolean; onExit: () => void }) {
  const [session, setSession] = useState<Session>(startNow ? { deckId: deckId ?? undefined } : null);
  if (!session) return <ReviewPicker onStart={(id) => setSession({ deckId: id })} />;
  return <ReviewSession deckId={session.deckId} onEnd={() => { setSession(null); onExit(); }} />;
}

function ReviewPicker({ onStart }: { onStart: (deckId?: ID) => void }) {
  const { decks, cards, limits } = useStore();
  const tree = useMemo(() => buildTree(decks, cards, Date.now(), limits), [decks, cards, limits]);
  const sum = tree.reduce((a, n) => ({ due: a.due + n.counts.due, fresh: a.fresh + n.counts.fresh }), { due: 0, fresh: 0 });
  const total = { due: Math.min(sum.due, limits.reviewsLeft), fresh: Math.min(sum.fresh, limits.newLeft) };
  const rows: React.JSX.Element[] = [];
  const walk = (ns: typeof tree) => ns.forEach((n) => {
    if (n.counts.due + n.counts.fresh > 0) {
      rows.push(
        <ListRow key={n.deck.id} indent={n.depth} title={n.deck.name} chevron
          accessory={<CountPills fresh={n.counts.fresh} due={n.counts.due} />} onClick={() => onStart(n.deck.id)} />,
      );
    }
    walk(n.children);
  });
  walk(tree);
  return (
    <Page title="Review">
      <ListSection>
        <ListRow title="All Decks" subtitle="Everything due today" chevron
          accessory={<CountPills fresh={total.fresh} due={total.due} />} onClick={() => onStart()} />
      </ListSection>
      {rows.length > 0 ? <ListSection header="By Deck">{rows}</ListSection> : (
        <EmptyState title="All Caught Up" message="No cards are due right now." />
      )}
    </Page>
  );
}

function ReviewSession({ deckId, onEnd }: { deckId?: ID; onEnd: () => void }) {
  const { decks, settings, reload } = useStore();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [doneToday, setDoneToday] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget>(null);

  const deck = deckId ? decks.find((d) => d.id === deckId) : undefined;
  const pathById = useMemo(() => new Map(decks.map((d) => [d.id, d.path])), [decks]);

  const build = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const since = studyDayStart(now, settings.dayStartHour);
      const [due, logs] = await Promise.all([dueCards(deckId, now), db.listLogs({ since })]);
      const newDone = logs.filter((l) => l.fsrs.state === State.New).length;
      const revDone = logs.length - newDone;
      const reviews = due.filter((c) => !isNew(c)).slice(0, Math.max(0, settings.reviewsPerDay - revDone));
      const fresh = due.filter(isNew).slice(0, Math.max(0, settings.newCardsPerDay - newDone));
      setDoneToday(logs.length);
      setQueue([...reviews, ...fresh]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQueue([]);
    }
  }, [deckId, settings.dayStartHour, settings.newCardsPerDay, settings.reviewsPerDay]);

  useEffect(() => { build(); }, [build]);

  const current = queue?.[0];
  const intervals = useMemo(() => {
    if (!current) return {};
    try {
      const p = previewIntervals(current, new Date(), settings);
      return { [R.Again]: p[R.Again].label, [R.Hard]: p[R.Hard].label, [R.Good]: p[R.Good].label, [R.Easy]: p[R.Easy].label };
    } catch {
      return {};
    }
  }, [current, settings]);

  const rate = useCallback(async (rating: Rating) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const { card, log } = review(current, rating, now, settings);
      await db.putCard(card);
      await db.addLog(log);
      setDoneToday((n) => n + 1);
      setSessionCount((n) => n + 1);
      setQueue((q) => {
        const rest = (q ?? []).slice(1);
        return new Date(card.fsrs.due).getTime() - now.getTime() < LEARN_AHEAD_MS ? [...rest, card] : rest;
      });
      setFlipped(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [current, busy, settings]);

  const onSwipe = (dir: SwipeDir) => rate(dir === 'left' ? R.Again : dir === 'right' ? R.Good : R.Easy);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editor || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) setFlipped(true); else rate(R.Good); }
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate, editor]);

  // Refresh deck counts / tab badge once the queue is exhausted.
  const empty = queue !== null && queue.length === 0;
  useEffect(() => { if (empty && sessionCount > 0) reload().catch(() => {}); }, [empty, sessionCount, reload]);

  const end = async () => { await reload().catch(() => {}); onEnd(); };

  const counts = useMemo(() => {
    const q = queue ?? [];
    return {
      fresh: q.filter(isNew).length,
      learning: q.filter((c) => c.fsrs.state === State.Learning || c.fsrs.state === State.Relearning).length,
      review: q.filter((c) => c.fsrs.state === State.Review).length,
    };
  }, [queue]);

  return (
    <>
      <Page
        title={deck?.name ?? 'All Decks'}
        largeTitle={false}
        leading={<BarButton icon="chevron-left" onClick={end}>Review</BarButton>}
        trailing={current ? <BarButton onClick={() => setEditor({ card: current })}>Edit</BarButton> : undefined}
      >
        {error && <div className="form-error">{error}</div>}
        {queue === null ? (
          <div className="placeholder">Loading…</div>
        ) : current ? (
          <div className="review-stage">
            <div className="review-counts" aria-label="Remaining">
              <span className="count new">{counts.fresh}</span>
              <span className="count learn">{counts.learning}</span>
              <span className="count due">{counts.review}</span>
            </div>
            <ReviewCard
              card={current}
              deckPath={deckId ? undefined : pathById.get(current.deckId)}
              flipped={flipped}
              onFlip={() => setFlipped(true)}
              onSwipe={onSwipe}
            />
            <div className="review-actions">
              {flipped ? (
                <RatingButtons intervals={intervals} onRate={rate} disabled={busy} />
              ) : (
                <FilledButton onClick={() => setFlipped(true)}>Show Answer</FilledButton>
              )}
              <div className="review-gesture-hint">{flipped ? 'Swipe ← Again · → Good · ↑ Easy at end' : '\u00a0'}</div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<span className="done-check">✓</span>}
            title={sessionCount ? 'Session Complete' : 'All Caught Up'}
            message={
              <>
                {sessionCount > 0 && <div>You reviewed {sessionCount} card{sessionCount === 1 ? '' : 's'} this session.</div>}
                <div>{doneToday} review{doneToday === 1 ? '' : 's'} today.</div>
              </>
            }
            action={<FilledButton onClick={end}>Done</FilledButton>}
          />
        )}
      </Page>
      <CardEditorSheet
        target={editor}
        onClose={() => {
          setEditor(null);
          // Pick up edits to the current card.
          if (current) db.getCard(current.id).then((c) => {
            setQueue((q) => (q ? (c ? q.map((x) => (x.id === c.id ? c : x)) : q.filter((x) => x.id !== current.id)) : q));
          }).catch(() => {});
        }}
      />
    </>
  );
}
