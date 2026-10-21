import { shortDate } from '../lib/dates';

/** Minimal SVG bar chart (no chart library). */
export function BarChart({ data, height = 140 }: { data: { date: string; count: number }[]; height?: number }) {
  const W = 320;
  const top = 14;
  const bottom = 18;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = Math.max(1, data.length);
  const slot = W / n;
  const bw = Math.max(2, slot * 0.66);
  const h = height - top - bottom;
  const total = data.reduce((s, d) => s + d.count, 0);
  const labelIdx = new Set([0, Math.floor((n - 1) / 2), n - 1]);
  return (
    <svg className="bar-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${total} reviews in the last ${data.length} days`}>
      <line x1="0" x2={W} y1={top + h} y2={top + h} className="bar-axis" />
      <line x1="0" x2={W} y1={top} y2={top} className="bar-grid" />
      <text x={W} y={top - 4} textAnchor="end" className="bar-label">{max}</text>
      {data.map((d, i) => {
        const bh = d.count ? Math.max(2, (d.count / max) * h) : 0;
        const x = i * slot + (slot - bw) / 2;
        return (
          <g key={d.date}>
            <title>{`${shortDate(d.date)}: ${d.count}`}</title>
            <rect x={x} y={top + h - bh} width={bw} height={bh} rx={Math.min(2, bw / 2)} className={i === n - 1 ? 'bar today' : 'bar'} />
            {labelIdx.has(i) && (
              <text x={i * slot + slot / 2} y={height - 4} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="bar-label">
                {i === n - 1 ? 'Today' : shortDate(d.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
