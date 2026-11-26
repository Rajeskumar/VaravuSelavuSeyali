// Client-side preview of the server's split-resolution algorithm (spec §3.5 /
// §7.3, mirrored from services/split_engine.py's largest-remainder allocation).
// The server is always authoritative — this only gives the user a live preview
// that matches what the backend will actually compute and persist.

/**
 * Mirrors the server's rounding: round each share down to the cent, then give the remaining cents to
 * the largest *unrounded* leftover fractions, ties by member id ascending. Rounding the fractions first
 * would tie values the server tells apart, and show the extra cent on the wrong person.
 */
function distributeLargestRemainder(amount: number, raw: { id: string; raw: number }[]): Record<string, number> {
  const shares = raw.map(({ id, raw: r }) => {
    const exact = r * 100;
    // 1e-6 of a cent absorbs floating-point noise, both here and when comparing the fractions.
    const cents = Math.floor(exact + 1e-6);
    return { id, cents, remainder: Math.round((exact - cents) * 1e6) };
  });
  const residualCents = Math.round(amount * 100) - shares.reduce((sum, s) => sum + s.cents, 0);
  [...shares]
    .sort((a, b) => (b.remainder - a.remainder) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, residualCents))
    .forEach((s) => { s.cents += 1; });
  return Object.fromEntries(shares.map((s) => [s.id, s.cents / 100]));
}

/**
 * Starting values for an editable split: `total` (money or 100 percent) in `count` parts that add up
 * exactly. When it doesn't divide evenly, each leftover hundredth goes to a different, randomly
 * chosen part. The server refuses totals that are even a cent out.
 */
export function splitWithRandomRemainder(total: number, count: number): number[] {
  if (count <= 0 || !Number.isFinite(total)) return [];
  const units = Math.round(total * 100);
  // An absurd amount can't be split to the cent, and would never finish handing out the leftovers.
  if (!Number.isSafeInteger(units)) return new Array<number>(count).fill(0);
  const base = Math.floor(units / count);
  const parts = new Array<number>(count).fill(base);
  const open = parts.map((_, i) => i);
  for (let left = units - base * count; left > 0; left -= 1) {
    const [chosen] = open.splice(Math.floor(Math.random() * open.length), 1);
    parts[chosen] += 1;
  }
  return parts.map((p) => p / 100);
}

/** What a money or percentage field accepts while typing: at most two decimals, like the server. */
export const TWO_DECIMALS = /^\d*\.?\d{0,2}$/;

/**
 * Whether entered values add up to `target`. The slack only absorbs floating-point noise (0.1 + 0.2):
 * it is far below a cent, because the server compares exactly.
 */
export function addsUpTo(total: number, target: number): boolean {
  return Math.abs(total - target) < 1e-9;
}

/** Equal split across the given member ids. */
export function previewEqualSplit(amount: number, memberIds: string[]): Record<string, number> {
  if (memberIds.length === 0 || !Number.isFinite(amount)) return {};
  const raw = amount / memberIds.length;
  return distributeLargestRemainder(amount, memberIds.map((id) => ({ id, raw })));
}

/** Percentage split — entries' `value` is the percentage (0-100), not yet rounded to cents. */
export function previewPercentageSplit(
  amount: number,
  entries: { member_id: string; value: number }[]
): Record<string, number> {
  if (entries.length === 0 || !Number.isFinite(amount)) return {};
  const raw = entries.map((e) => ({ id: e.member_id, raw: amount * ((e.value || 0) / 100) }));
  return distributeLargestRemainder(amount, raw);
}

/** Shares split — entries' `value` is the number of shares (e.g. 1, 2, 0.5). */
export function previewSharesSplit(
  amount: number,
  entries: { member_id: string; value: number }[]
): Record<string, number> {
  if (entries.length === 0 || !Number.isFinite(amount)) return {};
  const totalShares = entries.reduce((sum, e) => sum + (e.value || 0), 0);
  if (totalShares <= 0) return {};
  const raw = entries.map((e) => ({ id: e.member_id, raw: amount * ((e.value || 0) / totalShares) }));
  return distributeLargestRemainder(amount, raw);
}

/** Adjustment split — entries' `value` is a fixed ± adjustment to their equal share. */
export function previewAdjustmentSplit(
  amount: number,
  entries: { member_id: string; value: number }[]
): Record<string, number> {
  if (entries.length === 0 || !Number.isFinite(amount)) return {};
  const totalAdjustments = entries.reduce((sum, e) => sum + (e.value || 0), 0);
  const baseAmount = amount - totalAdjustments;
  const baseShare = baseAmount / entries.length;
  const raw = entries.map((e) => ({ id: e.member_id, raw: baseShare + (e.value || 0) }));
  return distributeLargestRemainder(amount, raw);
}
