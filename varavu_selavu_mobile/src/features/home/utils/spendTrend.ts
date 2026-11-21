/** Helpers for the Home hero's six-month bar strip and month-over-month delta. */

export interface TrendPoint {
  /** 'YYYY-MM' */
  key: string;
  /** 'APR' */
  label: string;
  total: number;
  isCurrent: boolean;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The `count` months ending at `now`'s month, oldest first. Months the backend didn't return count as 0. */
export function lastMonthsTrend(
  monthlyTrend: { month: string; total: number }[] | undefined,
  now: Date,
  count = 6,
): TrendPoint[] {
  const byKey = new Map<string, number>();
  (monthlyTrend || []).forEach((m) => byKey.set(m.month, m.total));

  const points: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    points.push({ key, label: MONTHS[d.getMonth()], total: byKey.get(key) ?? 0, isCurrent: i === 0 });
  }
  return points;
}

/** Bar heights as 0–1 fractions of the tallest month, with a floor so an empty month still renders a stub. */
export function barFractions(points: TrendPoint[], floor = 0.06): number[] {
  const max = Math.max(...points.map((p) => p.total), 0);
  if (max <= 0) return points.map(() => floor);
  return points.map((p) => Math.max(p.total / max, floor));
}

/**
 * Last month's first N days, where N is how far into `now`'s month we are (clamped to last month's
 * length) — the like-for-like baseline for a mid-month delta. Comparing 5 days of October against
 * all of September read as "↓64%" on the 5th of every month.
 */
export function previousMonthToDateRange(now: Date): { start_date: string; end_date: string } {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const end = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(now.getDate(), prevDays));
  return { start_date: ymd(prevStart), end_date: ymd(end) };
}

/** Whole-percent change from `previous` to `current`, or null with no baseline (rather than +∞). */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
