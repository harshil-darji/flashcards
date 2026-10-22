import type { Progress } from '../../../core/progress';
import { ProgressBar } from './ProgressBar';

/** "N cards · X% mastered" with a thin mastery bar beneath. */
export function DeckRowSubtitle({ total, progress }: { total: number; progress?: Progress }) {
  const cards = `${total} card${total === 1 ? '' : 's'}`;
  if (!progress || !total) return <>{cards}</>;
  return (
    <span className="deck-sub">
      <span className="deck-sub-text">
        {cards}
        <span className={progress.mastered ? 'deck-sub-mastered' : 'deck-sub-zero'}> · {progress.pct}% mastered</span>
      </span>
      <ProgressBar p={progress} />
    </span>
  );
}
