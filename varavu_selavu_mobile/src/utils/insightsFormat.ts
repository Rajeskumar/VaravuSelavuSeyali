/** Pure presentation helpers for the V2 Insights screens. */
import type { ChangeInsight } from '../api/analytics';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthOption { value: string; year: number; month: number; label: string }

/** The last `count` months ending at `now`'s month, newest first — feeds the "Sep 2026 ▾" picker. */
export function recentMonths(now: Date, count = 12): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    out.push({ value: `${year}-${String(month).padStart(2, '0')}`, year, month, label: `${MONTHS[d.getMonth()]} ${year}` });
  }
  return out;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type ChangeTone = 'error' | 'warning' | 'success' | 'accent';

export interface ChangeRowModel {
  title: string;
  meta: string;
  delta: string;
  tone: ChangeTone;
  /** What tapping the row should open, when the insight is about a single item or merchant. */
  link?: { kind: 'item' | 'merchant'; name: string };
}

/**
 * Turns a backend change insight into a "what changed" row: a headline, a "$now vs $before" line,
 * a delta coloured by meaning (a spend increase is bad — red once it more than doubles, amber
 * otherwise; a decrease is green; a brand-new merchant is neutral cyan and shows its amount),
 * and a link to the item/merchant behind it when there is one.
 */
export function changeRow(c: ChangeInsight, prevMonthLabel: string): ChangeRowModel {
  if (c.metric_name === 'New Merchant Detected') {
    return {
      title: `New merchant · ${c.entity_name ?? 'unknown'}`,
      meta: 'First charge this month',
      delta: money(c.current_value).replace(/\.00$/, ''),
      tone: 'accent',
      link: c.entity_name ? { kind: 'merchant', name: c.entity_name } : undefined,
    };
  }

  const up = c.change_percent > 0;
  const pct = Math.abs(c.change_percent);
  const tone: ChangeTone = !up ? 'success' : pct >= 150 ? 'error' : 'warning';
  const meta = c.previous_value > 0
    ? `${money(c.current_value)} vs ${money(c.previous_value)} in ${prevMonthLabel}`
    : (c.entity_name ?? '');

  let link: ChangeRowModel['link'];
  if (c.entity_name) {
    if (c.time_scope === 'merchant') link = { kind: 'merchant', name: c.entity_name };
    else if (c.metric_name.startsWith('Price increase for')) link = { kind: 'item', name: c.entity_name };
  }
  return { title: c.metric_name, meta, delta: `${up ? '+' : '−'}${pct.toFixed(0)}%`, tone, link };
}

export interface PricePoint { date: string; unit_price: number }

/**
 * "VS 6 MO AGO" on the item screen: the latest price against the purchase closest to six months
 * earlier when the history reaches back at least ~5 months, otherwise against the first purchase
 * (and the label says so). Null when there's nothing to compare.
 */
export function priceChange(history: PricePoint[], now: Date): { label: string; percent: number } | null {
  const pts = [...history].filter((p) => p.unit_price > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const sixAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).getTime();
  const oldest = new Date(pts[0].date).getTime();
  const spansSixMonths = new Date(last.date).getTime() - oldest >= 150 * 86400000;

  let base = pts[0];
  let label = 'SINCE FIRST BUY';
  if (spansSixMonths) {
    label = 'VS 6 MO AGO';
    base = pts.reduce((best, p) =>
      Math.abs(new Date(p.date).getTime() - sixAgo) < Math.abs(new Date(best.date).getTime() - sixAgo) ? p : best, pts[0]);
  }
  if (base === last || base.unit_price === 0) return null;
  return { label, percent: Math.round(((last.unit_price - base.unit_price) / base.unit_price) * 100) };
}

/** Confidence badge text + tone. */
export function confidenceBadge(confidence?: string | null): { label: string; tone: 'success' | 'warning' | 'muted' } {
  const c = (confidence || '').toLowerCase();
  if (c === 'high') return { label: 'HIGH', tone: 'success' };
  if (c === 'medium') return { label: 'MED', tone: 'warning' };
  return { label: 'LOW', tone: 'muted' };
}

/** Donut series in the design's fixed colour order; everything past the fifth folds into grey. */
export const DONUT_COLORS = ['#AEA5FF', '#00E0E0', '#7C72E8', '#FBBF24', '#4ADE80'] as const;
export const DONUT_OTHERS = 'rgba(255,255,255,0.35)';
