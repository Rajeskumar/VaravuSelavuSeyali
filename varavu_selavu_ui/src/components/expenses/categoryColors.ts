/**
 * Category -> tint-dot color mapping for the ExpenseFeed row.
 *
 * Deterministic category-color table, keyed to match AddExpenseForm's `CATEGORY_GROUPS` main
 * categories so the dot color for e.g. "Food & Drink" is stable across the app. CerebroOS-era
 * ramp: same violet/cyan-anchored hues as `dashboard/SpendSpectrum.tsx`'s `SPECTRUM_PALETTE`,
 * for visual consistency between the dashboard's category spectrum and the expense feed's dots.
 * Unknown/legacy category strings fall back to a deterministic hash so they still get a stable
 * (if arbitrary) color instead of all collapsing to one "other" gray.
 */
const CATEGORY_TINTS: Record<string, string> = {
  Home: '#9C93FF',
  Transportation: '#5FD9B8',
  'Food & Drink': '#F0975E',
  Entertainment: '#E88CD8',
  Life: '#B98BC9',
  Other: '#9AA0AF',
  Utilities: '#7DA6FF',
};

const FALLBACK_TINTS = ['#9C93FF', '#00D2D3', '#7DA6FF', '#5FD9B8', '#E88CD8', '#F0975E', '#6E7FE0', '#B98BC9'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Returns a stable tint-dot color for a given main category name. */
export function categoryTint(mainCategory: string | undefined | null): string {
  if (!mainCategory) return CATEGORY_TINTS.Other;
  if (CATEGORY_TINTS[mainCategory]) return CATEGORY_TINTS[mainCategory];
  return FALLBACK_TINTS[hashString(mainCategory) % FALLBACK_TINTS.length];
}

export default CATEGORY_TINTS;
