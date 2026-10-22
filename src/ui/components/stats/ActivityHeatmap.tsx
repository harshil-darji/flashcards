import { useState } from 'react';
import type { Heatmap } from '../../../core/stats';
import { shortDate } from '../../lib/dates';

const CELL = 14, GAP = 3, STEP = CELL + GAP, LEFT = 26, TOP = 14;
const DAY_LABELS: [number, string][] = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']];
const monthOf = (iso: string) => Number(iso.slice(5, 7));
const monthName = (iso: string) => { const [y, m] = iso.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' }); };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** GitHub-style calendar of reviews per day. Tap a cell to read its count. */
export function ActivityHeatmap({ data, today }: { data: Heatmap; today: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const W = LEFT + data.weeks.length * STEP - GAP;
  const H = TOP + 7 * STEP - GAP;
  const months = data.weeks.map((w, i) => (i === 0 || monthOf(w[0].date) !== monthOf(data.weeks[i - 1][0].date) ? monthName(w[0].date) : null));
  // Skip a month label if it would collide with the previous one.
  let lastAt = -9;
  const monthLabels = months.map((m, i) => { if (!m || i - lastAt < 3) return null; lastAt = i; return m; });
  const selected = sel ? data.weeks.flat().find((c) => c.date === sel) : null;
  return (
    <div className="heatmap">
      <svg className="heatmap-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${plural(data.total, 'review')} in the last ${data.weeks.length} weeks`}>
        {monthLabels.map((m, i) => m && <text key={i} x={LEFT + i * STEP} y={TOP - 4} className="heat-label">{m}</text>)}
        {DAY_LABELS.map(([d, l]) => <text key={l} x={0} y={TOP + d * STEP + CELL - 3} className="heat-label">{l}</text>)}
        {data.weeks.map((w, wi) => w.map((c, di) => !c.future && (
          <rect key={c.date} x={LEFT + wi * STEP} y={TOP + di * STEP} width={CELL} height={CELL} rx={3}
            className={`heat-cell l${c.level}${c.date === today ? ' today' : ''}${c.date === sel ? ' sel' : ''}`}
            onClick={() => setSel(c.date === sel ? null : c.date)}>
            <title>{`${shortDate(c.date)}: ${plural(c.count, 'review')}`}</title>
          </rect>
        )))}
      </svg>
      <div className="heatmap-foot">
        <span className="heatmap-readout">{selected ? `${selected.date === today ? 'Today' : shortDate(selected.date)}: ${plural(selected.count, 'review')}` : 'Tap a day for details'}</span>
        <span className="heatmap-legend" aria-hidden>
          Less
          {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`heat-swatch l${l}`} />)}
          More
        </span>
      </div>
    </div>
  );
}
