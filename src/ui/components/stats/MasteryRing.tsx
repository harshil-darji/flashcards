import type { Progress } from '../../../core/progress';

const SEGMENTS: { key: 'mastered' | 'young' | 'learning' | 'new'; label: string; cls: string }[] = [
  { key: 'mastered', label: 'Mastered', cls: 'mastered' },
  { key: 'young', label: 'Young', cls: 'young' },
  { key: 'learning', label: 'Learning', cls: 'learning' },
  { key: 'new', label: 'New', cls: 'new' },
];

/** Donut of card progress buckets with % mastered in the middle, plus a legend. */
export function MasteryRing({ p }: { p: Progress }) {
  const R = 50, SW = 12, C = 2 * Math.PI * R, GAP = p.total ? 1.5 : 0;
  let offset = 0;
  const arcs = SEGMENTS.map((s) => {
    const n = p[s.key];
    const len = p.total ? (n / p.total) * C : 0;
    const arc = { ...s, n, dash: Math.max(0, len - (len > GAP * 2 ? GAP : 0)), offset };
    offset += len;
    return arc;
  });
  return (
    <div className="mastery">
      <svg className="mastery-ring" viewBox="0 0 124 124" role="img" aria-label={`${p.pct}% mastered, ${p.mastered} of ${p.total} cards`}>
        <circle cx="62" cy="62" r={R} className="ring-track" strokeWidth={SW} fill="none" />
        <g transform="rotate(-90 62 62)">
          {arcs.map((a) => a.dash > 0 && (
            <circle key={a.key} cx="62" cy="62" r={R} fill="none" strokeWidth={SW} className={`ring-seg ${a.cls}`}
              strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={-a.offset} />
          ))}
        </g>
        <text x="62" y="62" textAnchor="middle" className="ring-pct">{p.pct}%</text>
        <text x="62" y="80" textAnchor="middle" className="ring-caption">mastered</text>
      </svg>
      <div className="mastery-side">
        <div className="mastery-total"><b>{p.mastered}</b> / {p.total} mastered</div>
        <ul className="mastery-legend">
          {[...arcs].reverse().map((a) => (
            <li key={a.key}>
              <span className={`legend-dot ${a.cls}`} />
              <span className="legend-label">{a.label}</span>
              <span className="legend-count">{a.n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
