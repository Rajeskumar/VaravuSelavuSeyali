// Client-side preview of the server's split-resolution algorithm (spec §3.5 /
// §7.3, mirrored from services/split_engine.py's largest-remainder allocation).
// The server is always authoritative — this only gives the user a live preview
// that matches what the backend will actually compute and persist.

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function distributeLargestRemainder(amount: number, raw: { id: string; raw: number }[]): Record<string, number> {
  const rounded: Record<string, number> = {};
  const remainders: { id: string; remainder: number }[] = [];
  let sum = 0;

  for (const { id, raw: r } of raw) {
    const floor = Math.floor(r * 100) / 100;
    rounded[id] = floor;
    sum += floor;
    remainders.push({ id, remainder: roundCents(r - floor) });
  }

  const residualCents = Math.round(roundCents(amount - sum) * 100);
  // Largest fractional remainder first; ties broken by member id ascending (§3.5).
  remainders.sort((a, b) => (b.remainder - a.remainder) || a.id.localeCompare(b.id));

  for (let i = 0; i < residualCents && i < remainders.length; i++) {
    rounded[remainders[i].id] = roundCents(rounded[remainders[i].id] + 0.01);
  }

  return rounded;
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
