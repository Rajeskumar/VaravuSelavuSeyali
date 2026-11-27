import type { BalanceTransfer } from '../api/groups';

/**
 * The payment that settles the viewer with one other member, taken from the group's suggested
 * transfers (netted in cents). Null when nothing is owed either way. A member's own `net` is their
 * position against the whole group, so it decides neither the direction nor the amount.
 */
export function paymentBetween(transfers: BalanceTransfer[], myId: string, otherId: string): BalanceTransfer | null {
  let cents = 0; // positive: I pay them
  for (const t of transfers) {
    if (t.from_member_id === myId && t.to_member_id === otherId) cents += Math.round(t.amount * 100);
    if (t.from_member_id === otherId && t.to_member_id === myId) cents -= Math.round(t.amount * 100);
  }
  if (cents === 0) return null;
  const [from_member_id, to_member_id] = cents > 0 ? [myId, otherId] : [otherId, myId];
  return { from_member_id, to_member_id, amount: Math.abs(cents) / 100 };
}
