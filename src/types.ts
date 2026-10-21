import type { Card as FSRSCard, ReviewLog as FSRSReviewLog } from 'ts-fsrs';

export type ID = string;
/** Epoch milliseconds. */
export type Timestamp = number;

/** Review grades. Numeric values match ts-fsrs `Rating` / `Grade` (Again=1 … Easy=4). */
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Rating = (typeof Rating)[keyof typeof Rating];
export type RatingName = keyof typeof Rating;

/** Scheduling state; identical shape to ts-fsrs `Card` (due, stability, difficulty, reps, lapses, state, …). */
export type FsrsState = FSRSCard;

export interface Deck {
  id: ID;
  /** Leaf name, e.g. "Two Pointers". */
  name: string;
  /** Full `::`-separated path, e.g. "LeetCode::Two Pointers". Unique. */
  path: string;
  parentId: ID | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Card {
  id: ID;
  deckId: ID;
  /** Markdown. */
  front: string;
  /** Markdown. */
  back: string;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** FSRS scheduling state (ts-fsrs Card). */
  fsrs: FsrsState;
}

export interface ReviewLog {
  id: ID;
  cardId: ID;
  deckId: ID;
  rating: Rating;
  reviewedAt: Timestamp;
  /** Raw ts-fsrs log for this review. */
  fsrs: FSRSReviewLog;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  /** FSRS target retention, 0.7–0.97. */
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  newCardsPerDay: number;
  reviewsPerDay: number;
  theme: ThemePreference;
  /** Hour (0–23) at which a new study day starts. */
  dayStartHour: number;
  /** Set true after seed decks were imported once. */
  seeded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  newCardsPerDay: 20,
  reviewsPerDay: 200,
  theme: 'system',
  dayStartHour: 4,
  seeded: false,
};
