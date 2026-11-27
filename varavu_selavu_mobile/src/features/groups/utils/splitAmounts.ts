import { parseAmount } from './parseAmount';

/** Split amount rules shared by the split and payer pickers. Mirrors web `utils/splitPreview.ts`. */

/**
 * Whether entered values add up to `target`. The slack only absorbs floating-point noise (0.1 + 0.2):
 * it is far below a cent, because the server compares exactly.
 */
export function addsUpTo(total: number, target: number): boolean {
  return Math.abs(total - target) < 1e-9;
}

/**
 * Whether a split, payer or receipt field takes this text. Digits, dots and commas stay exactly as typed, so an unclear
 * amount stays visible: dropping characters turned "1,234.50" into 1.23. The one exception, as before, is a third
 * decimal after a lone dot, which the server could not store anyway.
 */
export const acceptsAmountText = (text: string) => /^[\d.,]*$/.test(text) && !/^\d*\.\d{3,}$/.test(text);

/** The value of such text: 0 while nothing but a decimal mark is there, NaN when it can't be read for certain. */
export const typedValue = (text: string) => (/^[.,]?$/.test(text) ? 0 : parseAmount(text) ?? NaN);

/** An amount typed in a split or payer list can't be read. NaN must never be saved: it would be sent as empty. */
export const hasUnreadableSplit = (split: { type: string; entries: { value?: number }[] }) =>
  split.type !== 'equal' && split.entries.some((e) => Number.isNaN(e.value));
export const hasUnreadablePayer = (payers: { amount_paid: number }[]) => payers.some((p) => Number.isNaN(p.amount_paid));

/** Shown while any field holds NaN. Nothing that includes one may be saved. */
export const UNREADABLE_AMOUNT = 'Check the amounts: use one decimal mark and no thousands separators.';

/**
 * The text to show for an amount field. While someone is typing, "3." and "3.0" must stay as typed:
 * showing the parsed number would drop the decimal point. The typed text counts only while it still
 * means the stored value, so a change made elsewhere shows through.
 */
export function amountText(typed: string | undefined, value: number | undefined): string {
  if (typed !== undefined && Object.is(typedValue(typed), value ?? 0)) return typed;
  // `== null`: the server and saved drafts send null for "no value", whatever the type says.
  return value == null || Number.isNaN(value) ? '' : value.toString();
}

/** The server's rounding: down to the cent, then largest unrounded leftover, ties by member id. */
export function distributeCents(amount: number, raw: { id: string; raw: number }[]): number[] {
  const shares = raw.map(({ id, raw: r }) => {
    const exact = r * 100;
    const cents = Math.floor(exact + 1e-6);
    return { id, cents, remainder: Math.round((exact - cents) * 1e6) };
  });
  const residualCents = Math.round(amount * 100) - shares.reduce((sum, s) => sum + s.cents, 0);
  [...shares]
    .sort((a, b) => (b.remainder - a.remainder) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, residualCents))
    .forEach((s) => { s.cents += 1; });
  return shares.map((s) => s.cents / 100);
}
