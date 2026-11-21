/**
 * dayGroups.ts — TS-DES-102 parity: groups a date-sorted feed into day sections (Today /
 * Yesterday / "Sep 20") with a per-day subtotal, mirroring web's `ExpenseFeed.tsx`
 * `groupByDay`/`dayLabel`. Mobile's `ListRow`/`SectionLabel` render the section instead of
 * web's sticky MUI header, but the grouping rule and label convention are the same.
 */

/** Parses the two date shapes a feed row carries — personal rows use 'MM/DD/YYYY', group rows
 * use an ISO 'YYYY-MM-DD...' string — as a local-midnight Date. Constructing from (y, m, d)
 * components rather than `new Date(string)` avoids the UTC/local shift that would otherwise
 * roll an ISO date back a day in any positive-UTC-offset timezone. Returns null when unparseable
 * (kept out of the "Today"/"Yesterday" comparison rather than silently misdated). */
export function parseFeedDate(dateStr: string): Date | null {
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (mdy) {
    const [, m, d, y] = mdy;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const generic = new Date(dateStr);
  return Number.isNaN(generic.getTime()) ? null : generic;
}

/** 'Today' / 'Yesterday' / 'Sep 20' — natural case; the mono SectionLabel it renders in
 * uppercases via CSS, same convention as every other section label in the app. */
export function dayLabel(d: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - cmp.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return cmp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface DayGroup<T> {
  /** Stable React key — the calendar day, or 'unknown' for an unparseable date. */
  dateKey: string;
  label: string;
  items: T[];
  subtotal: number;
}

/** Groups an already-sorted (newest-first) feed into day sections. Grouping is a single pass
 * over a `Map`, which preserves first-seen key order — so as long as `rows` arrives sorted, the
 * output sections come out newest-first too, with no separate re-sort needed. */
export function groupRowsByDay<T extends { date: string; amount: number }>(
  rows: T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const map = new Map<string, { d: Date | null; items: T[] }>();
  for (const row of rows) {
    const d = parseFeedDate(row.date);
    const dateKey = d ? d.toDateString() : 'unknown';
    if (!map.has(dateKey)) map.set(dateKey, { d, items: [] });
    map.get(dateKey)!.items.push(row);
  }
  return Array.from(map.entries()).map(([dateKey, { d, items }]) => ({
    dateKey,
    label: d ? dayLabel(d, now) : 'Undated',
    items,
    subtotal: items.reduce((sum, it) => sum + it.amount, 0),
  }));
}
