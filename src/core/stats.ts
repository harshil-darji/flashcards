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

export type DayCount = { date: string; count: number };

/**
 * Cards coming due per study day for the next `days` days, starting today.
 * Today's bucket includes everything overdue. New (never-studied) cards are excluded:
 * they are gated by the new-cards-per-day limit, not by a due date.
 */
export function forecast(cards: Card[], days = 30, now: Date = new Date(), dayStartHour = 4): DayCount[] {
  const today = dayStart(now.getTime(), dayStartHour);
  const ends: number[] = [];
  const out: DayCount[] = [];
  for (let i = 0; i < days; i++) { out.push({ date: key(shift(today, i)), count: 0 }); ends.push(shift(today, i + 1).getTime()); }
  for (const c of cards) {
    if (c.fsrs.state === 0) continue; // State.New
    const t = new Date(c.fsrs.due).getTime();
    if (Number.isNaN(t)) continue;
    const i = ends.findIndex((e) => t < e);
    if (i >= 0) out[i].count++;
  }
  return out;
}

export type HeatCell = { date: string; count: number; /** 0 (none) … 4 (busiest) */ level: 0 | 1 | 2 | 3 | 4; future: boolean };
export type Heatmap = { /** Columns of 7 cells, Sunday first; last column contains today. */ weeks: HeatCell[][]; max: number; total: number };

/** GitHub-style review calendar for the last `weeks` weeks (Sunday-start columns). Days after today are `future`. */
export function heatmap(logs: ReviewLog[], weeks = 16, now: Date = new Date(), dayStartHour = 4): Heatmap {
  const counts = new Map<string, number>();
  for (const l of logs) { const k = dayKey(l.reviewedAt, dayStartHour); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const today = dayStart(now.getTime(), dayStartHour);
  const todayKey = key(today);
  const first = shift(today, -today.getDay() - (weeks - 1) * 7);
  const cols: { date: string; count: number; future: boolean }[][] = [];
  let future = false;
  let max = 0, total = 0;
  for (let w = 0; w < weeks; w++) {
    const col: { date: string; count: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const k = key(shift(first, w * 7 + d));
      const count = future ? 0 : counts.get(k) ?? 0;
      col.push({ date: k, count, future });
      if (!future) { max = Math.max(max, count); total += count; }
      if (k === todayKey) future = true;
    }
    cols.push(col);
  }
  const level = (n: number): HeatCell['level'] => (n <= 0 || max === 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((n / max) * 4))) as HeatCell['level']));
  return { weeks: cols.map((col) => col.map((c) => ({ ...c, level: level(c.count) }))), max, total };
}

/** Longest run of consecutive study days with at least one review, ever. */
export function longestStreak(logs: ReviewLog[], dayStartHour = 4): number {
  const days = [...new Set(logs.map((l) => dayKey(l.reviewedAt, dayStartHour)))].sort();
  const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  let best = 0, run = 0, prev: string | null = null;
  for (const k of days) {
    run = prev !== null && key(shift(parse(prev), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export type Retention = { total: number; correct: number; /** % not rated Again, rounded; null when no reviews. */ pct: number | null };

/** Share of reviews in the last `days` study days (1 = today) not rated Again. */
export function retention(logs: ReviewLog[], days = 30, now: Date = new Date(), dayStartHour = 4): Retention {
  const from = shift(dayStart(now.getTime(), dayStartHour), -(days - 1)).getTime();
  let total = 0, correct = 0;
  for (const l of logs) {
    if (l.reviewedAt < from) continue;
    total++;
    if (l.rating !== 1) correct++;
  }
  return { total, correct, pct: total ? Math.round((correct / total) * 100) : null };
}
