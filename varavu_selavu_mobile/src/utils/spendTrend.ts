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
 * Whole-percent change of the current month vs the previous one, or null when there's no previous
 * month to compare against (no baseline → no delta shown, rather than a misleading +∞).
 * Only meaningful mid-month if compared like-for-like, so callers label it "vs last month".
 */
export function monthOverMonthPercent(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const cur = points[points.length - 1].total;
  const prev = points[points.length - 2].total;
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
