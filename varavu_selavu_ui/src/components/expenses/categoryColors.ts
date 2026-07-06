/**
 * Category -> tint-dot color mapping for the ExpenseFeed row (TS-DES-102).
 *
 * No deterministic category-color table existed anywhere in the app before this
 * (confirmed by search — TopCategoriesChart/CategoryBreakdownSunburst assign
 * colors by array index/plotly colorway, not by category name, so they can't be
 * reused as-is). This table's keys match AddExpenseForm's `CATEGORY_GROUPS` main
 * categories and the hues from `docs/design/prototypes/ExpenseFeed.jsx` so the
 * dot color for e.g. "Food & Drink" is stable across the app and matches the
 * reference prototype. Unknown/legacy category strings fall back to a deterministic
 * hash so they still get a stable (if arbitrary) color instead of all collapsing
 * to one "other" gray.
 */
const CATEGORY_TINTS: Record<string, string> = {
  Home: '#7E8CA3',
  Transportation: '#5E9C8F',
  'Food & Drink': '#C97B4D',
  Entertainment: '#B98CC2',
  Life: '#C77B9E',
  Other: '#9AA0A6',
  Utilities: '#A3A86B',
};

const FALLBACK_TINTS = ['#7E8CA3', '#5E9C8F', '#C97B4D', '#B98CC2', '#C77B9E', '#A3A86B', '#8C7BC9', '#4D9BC9'];

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
