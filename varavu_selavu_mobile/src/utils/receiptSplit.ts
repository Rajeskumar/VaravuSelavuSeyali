/**
 * Pure maths behind the receipt Items sheet: who owns which scanned line, and what each person's
 * share of the whole receipt (lines + tax − discount) comes to. Everything is done in integer cents
 * so shares always add back up to the receipt exactly.
 */

export interface ReceiptLine {
  line_no: number;
  line_total: number;
}

/** line_no → member ids assigned to that line. A missing/empty entry means "split among everyone". */
export type Assignments = Record<number, string[]>;

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

/** Splits `cents` across `weights` proportionally (largest remainder); the result sums to `cents`. */
export function distributeCents(cents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const wSum = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (abs * x) / wSum);
  const out = exact.map(Math.floor);
  let left = abs - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i] += 1;
  return out.map((c) => sign * c);
}

/** The assignees that actually count for a line: those still in the split, or everyone if none. */
export function effectiveAssignees(assigned: string[] | undefined, participantIds: string[]): string[] {
  const valid = (assigned ?? []).filter((id) => participantIds.includes(id));
  return valid.length > 0 ? valid : participantIds;
}

/** member_ratios for the itemized group-expense API: equal weight across the line's assignees. */
export function buildMemberRatios(assigned: string[] | undefined, participantIds: string[]): Record<string, number> {
  const ids = effectiveAssignees(assigned, participantIds);
  return Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));
}

/** Toggles a member on a line, returning a new assignments map. */
export function toggleAssignee(assignments: Assignments, lineNo: number, memberId: string): Assignments {
  const cur = assignments[lineNo] ?? [];
  const next = cur.includes(memberId) ? cur.filter((id) => id !== memberId) : [...cur, memberId];
  return { ...assignments, [lineNo]: next };
}

export interface ReceiptShares {
  /** Each participant's total (their lines plus their prorated share of tax − discount). */
  perMember: Record<string, number>;
  /** tax − discount, the amount prorated across people. */
  extras: number;
}

export function computeReceiptShares(
  lines: ReceiptLine[],
  assignments: Assignments,
  participantIds: string[],
  tax: number,
  discount: number,
): ReceiptShares {
  const subtotal: Record<string, number> = Object.fromEntries(participantIds.map((id) => [id, 0]));
  for (const line of lines) {
    const ids = effectiveAssignees(assignments[line.line_no], participantIds);
    if (ids.length === 0) continue;
    const parts = distributeCents(toCents(line.line_total), ids.map(() => 1));
    ids.forEach((id, i) => { subtotal[id] += parts[i]; });
  }
  const extrasCents = toCents(tax) - toCents(discount);
  const extraParts = distributeCents(extrasCents, participantIds.map((id) => subtotal[id]));
  const perMember: Record<string, number> = {};
  participantIds.forEach((id, i) => { perMember[id] = fromCents(subtotal[id] + extraParts[i]); });
  return { perMember, extras: fromCents(extrasCents) };
}
