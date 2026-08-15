/**
 * Single shared money formatter — replaces seven near-duplicate `formatMoney`-style
 * helpers that were each hardcoded to `$`, so a non-USD group (real per-expense
 * currency + fx conversion exist server-side since TS-GRP-131) still rendered every
 * amount with a dollar sign. `Intl.NumberFormat` gets locale-correct symbol,
 * placement, and decimal formatting for free instead of a hand-rolled symbol map.
 *
 * Returns the absolute value formatted — callers that show a signed net balance
 * prepend their own +/- glyph, matching the existing call-site convention (the sign
 * character itself varies by call site: '+/-', unicode '−', etc.).
 */
export function formatMoney(amount: number, currencyCode: string = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
      Math.abs(amount)
    );
  } catch {
    // Unknown/invalid currency code — don't throw on a render path.
    return `${currencyCode} ${Math.abs(amount).toFixed(2)}`;
  }
}

/** Just the glyph (e.g. "$", "€") for an `InputAdornment`-style prefix, where the
 * amount itself is still a plain numeric `TextField`. */
export function currencySymbol(currencyCode: string = 'USD'): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}
