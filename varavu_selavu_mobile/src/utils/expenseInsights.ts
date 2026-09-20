/** Pure helpers behind V2's expense rows and detail sheet. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * 'Sep 19' from either the personal-expense 'MM/DD/YYYY' format or an ISO date. Returns the input
 * unchanged if it can't be parsed, so an odd backend value degrades to raw text rather than 'NaN'.
 */
export function shortDate(dateStr: string): string {
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (mdy) return `${MONTHS[Number(mdy[1]) - 1] ?? mdy[1]} ${Number(mdy[2])}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (iso) return `${MONTHS[Number(iso[2]) - 1] ?? iso[2]} ${Number(iso[3])}`;
  return dateStr;
}

interface Comparable {
  row_id: number;
  description: string;
  merchant_name?: string | null;
  cost: number;
}

export interface AnomalyNote {
  /** Whole-percent above the usual amount. */
  percentAbove: number;
  usual: number;
  text: string;
}

const MIN_HISTORY = 3;
const THRESHOLD = 1.5;

/**
 * "This is 116% above your usual $13.36 here." — only when the same merchant (or, lacking one, the
 * same description) has at least three *other* expenses and this one is ≥1.5× their mean. It's a
 * heuristic over the rows already loaded on device, not a server-side baseline, so it stays quiet
 * unless there's real history to compare against.
 */
export function anomalyNote(expense: Comparable, all: Comparable[]): AnomalyNote | null {
  const key = (e: Comparable) => (e.merchant_name || e.description || '').trim().toLowerCase();
  const mine = key(expense);
  if (!mine) return null;

  const others = all.filter((e) => e.row_id !== expense.row_id && key(e) === mine && e.cost > 0);
  if (others.length < MIN_HISTORY) return null;

  const usual = others.reduce((s, e) => s + e.cost, 0) / others.length;
  if (usual <= 0 || expense.cost < usual * THRESHOLD) return null;

  const percentAbove = Math.round(((expense.cost - usual) / usual) * 100);
  return {
    percentAbove,
    usual,
    text: `This is ${percentAbove}% above your usual $${usual.toFixed(2)} here.`,
  };
}

/** 1 → '1st', 22 → '22nd', 11 → '11th'. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * Next time a "day N of the month" template comes due, counting today. A day the month doesn't
 * have (31 in September) lands on the month's last day, matching how monthly bills actually roll.
 */
export function nextRecurringOccurrence(dayOfMonth: number, today: Date): { date: Date; daysUntil: number } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const inMonth = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(dayOfMonth, last));
  };
  let date = inMonth(start.getFullYear(), start.getMonth());
  if (date < start) date = inMonth(start.getFullYear(), start.getMonth() + 1);
  return { date, daysUntil: Math.round((date.getTime() - start.getTime()) / 86400000) };
}

/**
 * What a group expense did to *my* balance: what I put in minus my share of it. Positive = the
 * group owes me for this one, negative = I owe. Shown as "you +$38.51" under each group row.
 */
export function myShareDelta(
  expense: { my_share: number; payer_summary: { member_id: string; amount_paid: number }[] },
  myMemberId?: string,
): number {
  const paid = expense.payer_summary.find((p) => p.member_id === myMemberId)?.amount_paid ?? 0;
  return Math.round((paid - expense.my_share) * 100) / 100;
}

/** Whole days left in a budget period, counting today; never negative. `periodEnd` is 'YYYY-MM-DD'. */
export function daysLeftInPeriod(periodEnd: string, today: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(periodEnd);
  if (!m) return 0;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 0);
}
