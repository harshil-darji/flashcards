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
import { Icon } from '../components/Icon';
import { ReviewCard, type SwipeDir } from '../components/ReviewCard';
import { RatingButtons } from '../components/RatingButtons';
import { FilledButton } from '../components/FilledButton';
import { EmptyState } from '../components/EmptyState';
import { CardEditorSheet, type EditorTarget } from '../components/CardEditorSheet';
import '../styles/review.css';

/** Cards rated into a short learning step come back in the same session. */
const LEARN_AHEAD_MS = 20 * 60 * 1000;

type Session = { deckId?: ID } | null;

/** `onImmersive(true)` while a card is on screen: the shell hides the tab bar for a full-screen session. */
export default function ReviewScreen({ deckId, startNow, onExit, onImmersive }: {
  deckId?: ID | null;
  startNow?: boolean;
  onExit: () => void;
  onImmersive?: (on: boolean) => void;
}) {
  const [session, setSession] = useState<Session>(startNow ? { deckId: deckId ?? undefined } : null);
  if (!session) return <ReviewPicker onStart={(id) => setSession({ deckId: id })} />;
  return <ReviewSession deckId={session.deckId} onImmersive={onImmersive} onEnd={() => { setSession(null); onExit(); }} />;
}

const crumbs = (path: string | undefined) => (path ?? '').split('::').map((s) => s.trim()).filter(Boolean).join(' › ');

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

function ReviewSession({ deckId, onEnd, onImmersive }: { deckId?: ID; onEnd: () => void; onImmersive?: (on: boolean) => void }) {
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

  // Session progress: cards graded so far / (graded + still queued). Learning steps that come back
  // in this session count again, so the total can grow by a card after an Again.
  const remaining = queue?.length ?? 0;
  const total = sessionCount + remaining;
  const pct = total ? Math.round((sessionCount / total) * 100) : 0;
  const counts = useMemo(() => {
    const q = queue ?? [];
    return {
      fresh: q.filter(isNew).length,
      learning: q.filter((c) => c.fsrs.state === State.Learning || c.fsrs.state === State.Relearning).length,
      review: q.filter((c) => c.fsrs.state === State.Review).length,
    };
  }, [queue]);
  const state = !current ? null
    : isNew(current) ? { cls: 'new', label: 'New' }
    : current.fsrs.state === State.Review ? { cls: 'review', label: 'Review' }
    : { cls: 'learn', label: 'Learning' };

  const immersive = queue === null || !!current;
  useEffect(() => { onImmersive?.(immersive); }, [immersive, onImmersive]);
  useEffect(() => () => onImmersive?.(false), [onImmersive]);

  return (
    <>
      {immersive ? (
        <section className="screen review-session" aria-label={`Review: ${deck?.name ?? 'All Decks'}`}>
          <div className="review-topbar">
            <button type="button" className="review-close" aria-label="End session" onClick={end}>
              <Icon name="close" size={24} strokeWidth={2.2} />
            </button>
            <div className="review-progress" role="progressbar" aria-label="Session progress"
              aria-valuemin={0} aria-valuemax={total} aria-valuenow={sessionCount}>
              <div className="review-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="review-progress-count"
              aria-label={`${sessionCount} of ${total} done; ${counts.fresh} new, ${counts.learning} learning, ${counts.review} review left`}
              data-new={counts.fresh} data-learn={counts.learning} data-review={counts.review}>
              {sessionCount} / {total}
            </span>
            {current && <button type="button" className="review-edit" onClick={() => setEditor({ card: current })}>Edit</button>}
          </div>
          {error && <div className="form-error">{error}</div>}
          {!current ? (
            <div className="placeholder">Loading…</div>
          ) : (
            <div className="review-stage">
              <div className="review-meta">
                <span className="review-deck-chip" title={pathById.get(current.deckId)}>{crumbs(pathById.get(current.deckId)) || 'Deck'}</span>
                {state && <span className={`review-state ${state.cls}`}>{state.label}</span>}
              </div>
              <ReviewCard
                card={current}
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
          )}
        </section>
      ) : (
        <Page
          title={deck?.name ?? 'All Decks'}
          largeTitle={false}
          leading={<BarButton icon="chevron-left" onClick={end}>Review</BarButton>}
        >
          {error && <div className="form-error">{error}</div>}
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
        </Page>
      )}
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
