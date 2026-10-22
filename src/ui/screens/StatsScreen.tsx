import { useEffect, useMemo, useState } from 'react';
import { State } from 'ts-fsrs';
import type { Card, ReviewLog } from '../../types';
import { listCards, listLogs } from '../../core/db';
import { studyDayStart } from '../lib/dates';
import { dueToday, forecast, heatmap, longestStreak, retention, streak } from '../../core/stats';
import { progressOf, MASTERED_STABILITY_DAYS } from '../../core/progress';
import { useStore } from '../store';
import { Page } from '../components/Page';
import { ListSection } from '../components/ListSection';
import { StatTile } from '../components/StatTile';
import { BarChart } from '../components/BarChart';
import { MasteryRing } from '../components/stats/MasteryRing';
import { ActivityHeatmap } from '../components/stats/ActivityHeatmap';
import { MetricRow } from '../components/stats/MetricRow';
import '../styles/stats.css';

const HEATMAP_WEEKS = 16;
const FORECAST_DAYS = 30;
const days = (n: number) => <>{n}<small> day{n === 1 ? '' : 's'}</small></>;

export default function StatsScreen() {
  const store = useStore();
  const { settings, version } = store;
  const [logs, setLogs] = useState<ReviewLog[] | null>(null);
  // The store refreshes cards only when a review session ends; read them fresh so
  // switching to Stats mid-session shows current progress.
  const [fresh, setFresh] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cards = fresh ?? store.cards;

  useEffect(() => {
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    listLogs().then(setLogs, fail);
    listCards().then(setFresh, fail);
  }, [version]);

  const s = useMemo(() => {
    const now = new Date();
    const h = settings.dayStartHour;
    const safe = <T,>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };
    const l = logs ?? [];
    const newCount = cards.filter((c) => c.fsrs.state === State.New).length;
    // Today's limits, from fresh logs (mirrors store.limits, which can lag mid-session).
    const todays = l.filter((x) => x.reviewedAt >= studyDayStart(now, h));
    const newDone = todays.filter((x) => x.fsrs?.state === State.New).length;
    const newLeft = Math.max(0, settings.newCardsPerDay - newDone);
    const reviewsLeft = Math.max(0, settings.reviewsPerDay - (todays.length - newDone));
    const fc = safe(() => forecast(cards, FORECAST_DAYS, now, h), []);
    const sum = (from: number, to: number) => fc.slice(from, to).reduce((a, d) => a + d.count, 0);
    const heat = safe(() => heatmap(l, HEATMAP_WEEKS, now, h), { weeks: [], max: 0, total: 0 });
    return {
      streak: safe(() => streak(l, now, h), 0),
      best: safe(() => longestStreak(l, h), 0),
      // core dueToday counts every New card as due; apply today's limits like the review queue does.
      due: Math.min(reviewsLeft, safe(() => dueToday(cards.filter((c) => c.fsrs.state !== State.New), now, h), 0))
        + Math.min(newLeft, newCount),
      today: safe(() => retention(l, 1, now, h), { total: 0, correct: 0, pct: null }),
      month: safe(() => retention(l, 30, now, h), { total: 0, correct: 0, pct: null }),
      progress: progressOf(cards),
      fc,
      todayKey: fc[0]?.date ?? '',
      fcToday: sum(0, 1),
      fcTomorrow: sum(1, 2),
      fc7: sum(0, 7),
      fc30: sum(0, FORECAST_DAYS),
      heat,
      activeDays: heat.weeks.flat().filter((c) => c.count > 0).length,
      allTime: l.length,
    };
  }, [logs, cards, settings.dayStartHour, settings.newCardsPerDay, settings.reviewsPerDay]);

  return (
    <Page title="Stats">
      {error && <div className="form-error">{error}</div>}
      <div className="stat-grid">
        <StatTile label="Streak" value={days(s.streak)} sub={`Best ${s.best} day${s.best === 1 ? '' : 's'}`} color="var(--orange)" />
        <StatTile label="Due Today" value={s.due} sub="within today's limits" color="var(--green)" />
        <StatTile label="Reviewed Today" value={s.today.total} sub={s.today.pct !== null ? `${s.today.pct}% correct` : 'none yet'} />
        <StatTile label="Retention" value={s.month.pct !== null ? <>{s.month.pct}<small>%</small></> : '–'} sub={`30 days · ${s.month.total} reviews`} color="var(--blue)" />
      </div>

      <ListSection header="Mastery" footer={`Mastered = in review with stability of ${MASTERED_STABILITY_DAYS}+ days.`}>
        <MasteryRing p={s.progress} />
      </ListSection>

      <ListSection header={`Forecast · Next ${FORECAST_DAYS} Days`} footer="Reviews coming due, overdue cards counted today. New cards not included.">
        <MetricRow items={[
          { label: 'Today', value: s.fcToday, accent: 'var(--green)' },
          { label: 'Tomorrow', value: s.fcTomorrow },
          { label: 'Next 7 days', value: s.fc7 },
          { label: `${FORECAST_DAYS} days`, value: s.fc30 },
        ]} />
        <div className="chart-wrap">
          <BarChart data={s.fc} direction="future" />
        </div>
      </ListSection>

      <ListSection header={`Activity · Last ${HEATMAP_WEEKS} Weeks`} footer={`${s.allTime} review${s.allTime === 1 ? '' : 's'} all time.`}>
        <MetricRow items={[
          { label: 'Current streak', value: days(s.streak), accent: 'var(--orange)' },
          { label: 'Longest', value: days(s.best) },
          { label: 'Active days', value: s.activeDays },
          { label: 'Reviews', value: s.heat.total },
        ]} />
        {logs === null ? <div className="placeholder chart-wrap">Loading…</div> : <ActivityHeatmap data={s.heat} today={s.todayKey} />}
      </ListSection>
    </Page>
  );
}
