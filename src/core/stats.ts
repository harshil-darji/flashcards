import type { Card, ReviewLog } from '../types';

const todo = (name: string): never => {
  throw new Error(`TODO: stats.${name} not implemented`);
};

/** Consecutive study days ending today (or yesterday if nothing yet today). */
export function streak(logs: ReviewLog[], now: Date = new Date(), dayStartHour = 4): number { return todo('streak'); }

/** Number of cards due by end of today's study day. */
export function dueToday(cards: Card[], now: Date = new Date(), dayStartHour = 4): number { return todo('dueToday'); }

/** Review counts per local day (YYYY-MM-DD) for the last `days` days, oldest first. */
export function reviewsPerDay(logs: ReviewLog[], days = 30, now: Date = new Date(), dayStartHour = 4): { date: string; count: number }[] { return todo('reviewsPerDay'); }
