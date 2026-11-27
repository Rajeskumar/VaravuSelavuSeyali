/** Split amount rules shared by the split and payer pickers. Mirrors web `utils/splitPreview.ts`. */

/**
 * Whether entered values add up to `target`. The slack only absorbs floating-point noise (0.1 + 0.2):
 * it is far below a cent, because the server compares exactly.
 */
export function addsUpTo(total: number, target: number): boolean {
  return Math.abs(total - target) < 1e-9;
}

/**
 * A comma typed as the decimal mark becomes a dot before the check below. Refusing the keystroke instead left the digits
 * typed after it to be appended: "2,50" became 250.
 */
export const withDecimalDot = (text: string) => text.replace(/,/g, '.');

/** What a split or payer field accepts while typing: at most two decimals, like the server. */
export const TWO_DECIMALS = /^\d*\.?\d{0,2}$/;

/**
 * The text to show for an amount field. While someone is typing, "3." and "3.0" must stay as typed:
 * showing the parsed number would drop the decimal point. The typed text counts only while it still
 * means the stored value, so a change made elsewhere shows through.
 */
export function amountText(typed: string | undefined, value: number | undefined): string {
  if (typed !== undefined && (parseFloat(typed) || 0) === (value ?? 0)) return typed;
  return value?.toString() ?? '';
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
