import type { ID } from '../../../types';
import type { PlanSummary } from '../../../core/plans';
import type { DeckNode } from '../../lib/decks';
import { findNode } from '../../lib/decks';
import { Page } from '../Page';
import { BarButton } from '../BarButton';
import { ProgressBar } from './ProgressBar';

/** Plan detail: overall progress + each category in plan order with a Study button for its deck. */
export function PlanView({ summary, tree, onBack, onStudy }: {
  summary: PlanSummary;
  tree: DeckNode[];
  onBack: () => void;
  onStudy: (deckId: ID) => void;
}) {
  const { plan, overall, categories } = summary;
  return (
    <Page title={plan.title} leading={<BarButton icon="chevron-left" onClick={onBack}>Decks</BarButton>}>
      <div className="plan-summary">
        <div className="plan-card-figure">
          <span className="plan-card-num">{overall.mastered}</span>
          <span className="plan-card-of">/ {overall.total} mastered</span>
          <span className="plan-card-pct">{overall.pct}%</span>
        </div>
        <ProgressBar p={overall} tall />
        <div className="plan-card-meta">
          <span className={`meta-chip due${overall.due ? '' : ' zero'}`}>{overall.due} due today</span>
          <span className="meta-chip learning">{overall.learning + overall.young} in progress</span>
          <span className="meta-chip">{overall.new} not started</span>
        </div>
      </div>

      <div className="list-section">
        <div className="list-header">Topics</div>
        <div className="plan-group">
          {categories.map((c, i) => {
            const node = c.deckId ? findNode(tree, c.deckId) : undefined;
            const studyable = node ? node.counts.due + node.counts.fresh : 0;
            const done = c.total > 0 && c.mastered === c.total;
            return (
              <div className="plan-row" key={c.category.tag}>
                <span className={`plan-step${done ? ' done' : ''}`} aria-hidden="true">{i + 1}</span>
                <span className="plan-row-main">
                  <span className="plan-row-title">{c.category.name}</span>
                  <span className="plan-row-sub">
                    <span className="plan-row-frac">{c.mastered}/{c.total} mastered</span>
                    {c.due > 0 && <span className="plan-row-due"> · {c.due} due</span>}
                  </span>
                  <ProgressBar p={c} />
                </span>
                <button
                  type="button"
                  className="plan-study"
                  disabled={!c.deckId || studyable === 0}
                  aria-label={`Study ${c.category.name}`}
                  onClick={() => c.deckId && onStudy(c.deckId)}
                >
                  Study
                </button>
              </div>
            );
          })}
        </div>
        <div className="list-footer">
          Progress counts only the {overall.total} NeetCode problem cards (tag “{plan.tag}”). Study opens the whole
          LeetCode deck for that topic, which also contains pattern cards. Mastered = reviewed with stability of 21+ days.
        </div>
      </div>
    </Page>
  );
}
