# TS-GRP-128 — Cross-group friend balances

**Phase:** 3 · **Spec:** §5.3, §8.3 · **Status:** 📋 Planned

## Scope

`GET /friends/balances` (§8.3) — "Total owed to/from a person across all shared groups" (§4 user story pattern: "how much do I owe Meera?" summed over every group the two of you share, not just one). No new schema needed — this is an aggregation across `BalanceService`'s existing per-group pairwise transfers.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/balance_service.py` — `_pairwise_transfers(group_id)` (`balance_service.py:67-107`) already computes directed debtor→creditor amounts **within one group**. New `FriendBalanceService` (or a method on `BalanceService` — recommend a new class since this crosses group boundaries, unlike everything else in `BalanceService` which is intentionally single-group-scoped): `get_friend_balances(user_email) -> List[Dict]`:
  1. Find every group the user is an active member of (`GroupService.list_groups_for_user`).
  2. For each, compute `_pairwise_transfers` and extract entries touching the user's own `member_id`.
  3. Group the results **by counterparty person**, not by `member_id` — this is the subtle part: the same real person (by `user_email`, or by matching placeholder identity across groups is *not* possible and out of scope — cross-group aggregation only works for **registered** counterparties who share a stable `user_email`; a placeholder in one group and a different placeholder in another group cannot be unified) may hold different `group_members.id` rows in different groups. Aggregate net amount per counterparty `user_email`, summed with sign convention "positive = they owe you."
  4. Return `[{counterparty_email, counterparty_display_name, net, groups: [{group_id, name, net}]}]` — include the per-group breakdown alongside the total, since "how much do I owe Meera, and where" is more useful than a bare number.
- `varavu_selavu_app/varavu_selavu_service/api/routes.py` or `groups_routes.py` — new `GET /friends/balances` route (top-level, not group-scoped — auth via JWT only, no membership check needed since it's inherently self-scoped).
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `FriendBalanceDTO`, `FriendBalanceGroupBreakdown`, `FriendBalancesResponse`.
- **Web:** new page or section — spec doesn't name a route for this; recommend a small widget on `GroupsPage.tsx` ("Balances with people" list) rather than a brand-new top-level route, since it's a cross-cutting view over existing group data, not a new domain object.
- **Mobile:** equivalent widget on `GroupsScreen.tsx`.

## Acceptance criteria

- A user who shares 2 groups with the same registered friend sees **one** aggregated net balance for that friend (not two separate rows), with a breakdown showing the per-group contribution.
- A placeholder counterparty is only ever shown per-group (no cross-group aggregation attempted for them) — verify this doesn't crash or silently misattribute, just correctly scopes them to their single group.
- Sign convention is consistent and tested both directions (friend owes user; user owes friend).
- Settling up in one group correctly changes only that group's contribution to the aggregate, not the others.

## Dependencies

- **TS-GRP-104** (`BalanceService._pairwise_transfers`), **TS-GRP-114** (multi-payer — the pairwise transfer construction it depends on needs to be correct for N payers by the time this ships).

## Test requirements

- New `varavu_selavu_app/tests/test_friend_balances.py`: same-friend-across-2-groups aggregation, placeholder-not-aggregated-cross-group, sign convention both directions, settlement in one group doesn't affect the other group's contribution to the total.
