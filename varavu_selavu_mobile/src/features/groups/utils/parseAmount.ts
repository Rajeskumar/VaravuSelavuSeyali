/**
 * The amount a person typed, or null when it can't be read for certain. A comma is accepted as the decimal mark,
 * because some phone keypads offer only a comma. Anything with grouping ("1,234.50", "1,234") or more than two
 * decimals is refused: `parseFloat` would silently read a different amount.
 */
const AMOUNT = /^(\d+([.,]\d{0,2})?|[.,]\d{1,2})$/;

export function parseAmount(text: string): number | null {
  const typed = text.trim();
  return AMOUNT.test(typed) ? parseFloat(typed.replace(',', '.')) : null;
}
