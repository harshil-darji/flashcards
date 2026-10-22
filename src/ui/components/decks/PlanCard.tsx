import type { PlanSummary } from '../../../core/plans';
import { Icon } from '../Icon';
import { ProgressBar } from './ProgressBar';

/** Study plan summary tile shown at the top of Decks. */
export function PlanCard({ summary, onOpen }: { summary: PlanSummary; onOpen: () => void }) {
  const { plan, overall } = summary;
  return (
    <button type="button" className="plan-card" onClick={onOpen} aria-label={`${plan.title} study plan`}>
      <span className="plan-card-head">
        <span className="plan-card-badge" aria-hidden="true">{plan.expected}</span>
        <span className="plan-card-titles">
          <span className="plan-card-title">{plan.title}</span>
          <span className="plan-card-sub">{plan.categories.length} topics · roadmap order</span>
        </span>
        <span className="plan-chevron"><Icon name="chevron-right" size={16} strokeWidth={2.6} /></span>
      </span>
      <span className="plan-card-figure">
        <span className="plan-card-num">{overall.mastered}</span>
        <span className="plan-card-of">/ {overall.total} mastered</span>
        <span className="plan-card-pct">{overall.pct}%</span>
      </span>
      <ProgressBar p={overall} tall />
      <span className="plan-card-meta">
        <span className={`meta-chip due${overall.due ? '' : ' zero'}`}>{overall.due} due today</span>
        <span className="meta-chip learning">{overall.learning + overall.young} in progress</span>
        <span className="meta-chip">{overall.new} not started</span>
      </span>
    </button>
  );
}
