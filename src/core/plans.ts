import { State } from 'ts-fsrs';
import type { Card, Deck, ID } from '../types';
import { progressOf, type Progress } from './progress';

/** One step of a study plan: cards carrying both the plan tag and `tag`, studied via the deck at `deckPath`. */
export interface PlanCategory { name: string; tag: string; deckPath: string }

export interface StudyPlan {
  id: string;
  title: string;
  /** Every card in the plan carries this tag. */
  tag: string;
  /** Advertised size (e.g. 150); progress uses the cards actually present. */
  expected: number;
  categories: PlanCategory[];
}

/** NeetCode 150 in NeetCode roadmap order. Tags/decks match src/seed/neetcode150-*.json. */
export const NEETCODE_150: StudyPlan = {
  id: 'neetcode-150',
  title: 'NeetCode 150',
  tag: 'nc150',
  expected: 150,
  categories: [
    ['Arrays & Hashing', 'arrays-hashing'],
    ['Two Pointers', 'two-pointers'],
    ['Sliding Window', 'sliding-window'],
    ['Stack', 'stack'],
    ['Binary Search', 'binary-search'],
    ['Linked List', 'linked-list'],
    ['Trees', 'trees'],
    ['Tries', 'tries'],
    ['Heap / Priority Queue', 'heap'],
    ['Backtracking', 'backtracking'],
    ['Graphs', 'graphs'],
    ['Advanced Graphs', 'advanced-graphs'],
    ['1-D Dynamic Programming', '1d-dp'],
    ['2-D Dynamic Programming', '2d-dp'],
    ['Greedy', 'greedy'],
    ['Intervals', 'intervals'],
    ['Math & Geometry', 'math-geometry'],
    ['Bit Manipulation', 'bit-manipulation'],
  ].map(([name, tag]) => ({ name, tag, deckPath: `LeetCode::${name}` })),
};

export const STUDY_PLANS: StudyPlan[] = [NEETCODE_150];

export type PlanProgress = Progress & { due: number };
export type CategoryProgress = PlanProgress & { category: PlanCategory; deckId: ID | null };
export interface PlanSummary { plan: StudyPlan; overall: PlanProgress; categories: CategoryProgress[] }

const dueCount = (cards: Card[], now: number) =>
  cards.filter((c) => c.fsrs.state !== State.New && new Date(c.fsrs.due).getTime() <= now).length;

/**
 * Progress over the plan's cards only (cards tagged `plan.tag`); other cards in the same decks are ignored.
 * Each category counts cards tagged with both the plan tag and the category tag. `due` excludes new cards.
 */
export function planProgress(plan: StudyPlan, cards: Card[], decks: Deck[], now = Date.now()): PlanSummary {
  const inPlan = cards.filter((c) => c.tags.includes(plan.tag));
  const byPath = new Map(decks.map((d) => [d.path, d.id]));
  const categories = plan.categories.map((category) => {
    const cs = inPlan.filter((c) => c.tags.includes(category.tag));
    return { ...progressOf(cs), due: dueCount(cs, now), category, deckId: byPath.get(category.deckPath) ?? null };
  });
  return { plan, overall: { ...progressOf(inPlan), due: dueCount(inPlan, now) }, categories };
}
