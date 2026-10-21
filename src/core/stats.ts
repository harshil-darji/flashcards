import type { Card, ReviewLog } from '../types';

/** Start (local time) of the study day containing `t`. */
function dayStart(t: number, dayStartHour: number): Date {
  const d = new Date(t);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  d.setHours(dayStartHour, 0, 0, 0);
  return d;
}
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayKey = (t: number, h: number) => key(dayStart(t, h));
const shift = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Consecutive study days ending today (or yesterday if nothing yet today). */
export function streak(logs: ReviewLog[], now: Date = new Date(), dayStartHour = 4): number {
  const days = new Set(logs.map((l) => dayKey(l.reviewedAt, dayStartHour)));
  let d = dayStart(now.getTime(), dayStartHour);
  if (!days.has(key(d))) d = shift(d, -1);
  let n = 0;
  while (days.has(key(d))) { n++; d = shift(d, -1); }
  return n;
}

/** Number of cards due by end of today's study day. */
export function dueToday(cards: Card[], now: Date = new Date(), dayStartHour = 4): number {
  const end = shift(dayStart(now.getTime(), dayStartHour), 1).getTime();
  return cards.filter((c) => new Date(c.fsrs.due).getTime() < end).length;
}

/** Review counts per local day (YYYY-MM-DD) for the last `days` days, oldest first. */
export function reviewsPerDay(logs: ReviewLog[], days = 30, now: Date = new Date(), dayStartHour = 4): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of logs) { const k = dayKey(l.reviewedAt, dayStartHour); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const today = dayStart(now.getTime(), dayStartHour);
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) { const k = key(shift(today, -i)); out.push({ date: k, count: counts.get(k) ?? 0 }); }
  return out;
}
