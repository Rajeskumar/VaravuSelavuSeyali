/** Client-side money bounds, mirroring the server's constrained money types.
 *
 * The server is authoritative (it returns 422); this exists so the user gets an
 * inline error instead of a failed save, and so the field cannot be filled with
 * a value long enough to overflow its container.
 */

export const MAX_AMOUNT = 1_000_000;

/** Longest string the field can hold: 1000000.00 */
export const MAX_AMOUNT_LENGTH = String(MAX_AMOUNT).length + 3;

export function amountError(value: number): string | null {
  if (!Number.isFinite(value) || value === 0) return null; // empty/untouched: not an error yet
  if (value < 0) return 'Amount must be greater than 0';
  if (value > MAX_AMOUNT) return `Amount must not exceed ${MAX_AMOUNT.toLocaleString()}`;
  if (Math.round(value * 100) !== Number((value * 100).toFixed(4))) {
    return 'Amount can have at most 2 decimal places';
  }
  return null;
}

export function isValidAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT && amountError(value) === null;
}

/** Normalizes raw input: digits and a single decimal point, max 2 decimals,
 * and never exceeding MAX_AMOUNT. Returns null when the edit should be rejected. */
export function sanitizeAmountInput(raw: string): string | null {
  if (raw === '') return '';

  let cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  const [whole, decimals] = cleaned.split('.');
  if (decimals !== undefined && decimals.length > 2) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed > MAX_AMOUNT) return null;
  if (whole.length > String(MAX_AMOUNT).length) return null;

  return cleaned;
}
