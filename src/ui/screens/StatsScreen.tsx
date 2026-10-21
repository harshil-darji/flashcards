import { useEffect, useMemo, useState } from 'react';
import { State } from 'ts-fsrs';
import type { ReviewLog } from '../../types';
import { listLogs } from '../../core/db';
import { dueToday, reviewsPerDay, streak } from '../../core/stats';
import { useStore } from '../store';
import { studyDayStart } from '../lib/dates';
import { Page } from '../components/Page';
import { ListSection } from '../components/ListSection';
import { ListRow } from '../components/ListRow';
import { StatTile } from '../components/StatTile';
import { BarChart } from '../components/BarChart';

export default function StatsScreen() {
  const { cards, settings, version, limits } = useStore();
  const [logs, setLogs] = useState<ReviewLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLogs().then(setLogs, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [version]);

  const s = useMemo(() => {
    const now = new Date();
    const h = settings.dayStartHour;
    const safe = <T,>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };
    const l = logs ?? [];
    const start = studyDayStart(now, h);
    const today = l.filter((x) => x.reviewedAt >= start);
    const byState = (st: State) => cards.filter((c) => c.fsrs.state === st).length;
    const chart = safe(() => reviewsPerDay(l, 30, now, h), []);
    return {
      streak: safe(() => streak(l, now, h), 0),
      // core dueToday counts every New card as due; apply today's limits like the review queue does.
      due: Math.min(limits.reviewsLeft, safe(() => dueToday(cards.filter((c) => c.fsrs.state !== State.New), now, h), 0))
        + Math.min(limits.newLeft, byState(State.New)),
      today: today.length,
      againToday: today.filter((x) => x.rating === 1).length,
      chart,
      total30: chart.reduce((a, d) => a + d.count, 0),
      fresh: byState(State.New),
      learning: byState(State.Learning) + byState(State.Relearning),
      review: byState(State.Review),
      allTime: l.length,
    };
  }, [logs, cards, settings.dayStartHour, limits]);

  const retentionToday = s.today ? Math.round(((s.today - s.againToday) / s.today) * 100) : null;

  return (
    <Page title="Stats">
      {error && <div className="form-error">{error}</div>}
      <div className="stat-grid">
        <StatTile label="Streak" value={<>{s.streak}<small> day{s.streak === 1 ? '' : 's'}</small></>} color="var(--orange)" />
        <StatTile label="Due Today" value={s.due} color="var(--green)" />
        <StatTile label="Reviewed Today" value={s.today} sub={retentionToday !== null ? `${retentionToday}% correct` : undefined} />
        <StatTile label="Last 30 Days" value={s.total30} sub={`${(s.total30 / 30).toFixed(1)} / day`} />
      </div>
      <ListSection header="Reviews · Last 30 Days">
        <div className="chart-wrap">
          {logs === null ? <div className="placeholder">Loading…</div> : <BarChart data={s.chart} />}
        </div>
      </ListSection>
      <ListSection header="Cards">
        <ListRow title="New" detail={s.fresh} />
        <ListRow title="Learning" detail={s.learning} />
        <ListRow title="Review" detail={s.review} />
        <ListRow title="Total" detail={cards.length} />
        <ListRow title="All-time Reviews" detail={s.allTime} />
      </ListSection>
    </Page>
  );
}
