import { toISODate } from './date';

/**
 * The date window for an expense a person enters: no future dates (Recurring is for upcoming
 * bills) and nothing older than a year. Mirrors the server's `core/expense_dates.py`, which is the
 * authority; this only keeps people from picking a date the API will refuse.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const FUTURE_DATE_MESSAGE = "Date can't be in the future. Use a recurring expense for upcoming bills.";
export const OLD_DATE_MESSAGE = "Date can't be more than a year ago.";

/** Today's date as YYYY-MM-DD in the person's own timezone. Never `toISOString()`: that is the UTC
 * date, which west of UTC turns into "tomorrow" every evening — and tomorrow is a future date. */
export function todayIso(now: Date = new Date()): string {
  return toISODate(now);
}

export function expenseDateBounds(now: Date = new Date()): { min: string; max: string } {
  const min = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { min: toIso(min), max: toIso(now) };
}

/** Why `iso` (YYYY-MM-DD) is not allowed, or '' when it is fine or not yet a full date.
 * `original` is an edited expense's stored date: leaving it unchanged is always allowed, even if
 * it is now more than a year old (only moving it somewhere out of range is refused). */
export function expenseDateProblem(iso: string, now: Date = new Date(), original?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const { min, max } = expenseDateBounds(now);
  if (iso > max) return FUTURE_DATE_MESSAGE;
  if (iso < min && iso !== original) return OLD_DATE_MESSAGE;
  return '';
}
