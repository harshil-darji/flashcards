/** Start (epoch ms) of the current study day, which begins at `dayStartHour` local time. */
export function studyDayStart(now: Date = new Date(), dayStartHour = 4): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  if (now.getTime() < d.getTime()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
