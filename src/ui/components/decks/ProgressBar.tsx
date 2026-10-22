import type { Progress } from '../../../core/progress';

/** Thin bar: solid = mastered, faint = in progress (learning + young). */
export function ProgressBar({ p, tall }: { p: Progress; tall?: boolean }) {
  const pct = (n: number) => (p.total ? (n / p.total) * 100 : 0);
  const mastered = pct(p.mastered);
  const started = pct(p.learning + p.young);
  return (
    <span
      className={`mastery-bar${tall ? ' tall' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p.pct}
      aria-label={`${p.mastered} of ${p.total} mastered`}
    >
      <span className="mastery-bar-started" style={{ width: `${Math.min(100, mastered + started)}%` }} />
      <span className="mastery-bar-mastered" style={{ width: `${mastered}%` }} />
    </span>
  );
}
