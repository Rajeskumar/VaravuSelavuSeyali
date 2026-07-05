# TS-GRP-105 — Settlements (record / list / undo)

**Phase:** 1 · **Build order:** 4th (before the balances endpoint — `BalanceService.net(m)` references settlement rows) · **Spec:** §3.1, §3.3, §5.3, §7.1, §8.3 · **Status:** ✅ Completed

## Implementation notes (post-build)

- **"Reuse `GroupService.resolve_member`" didn't fit as literally described.** `resolve_member(group_id, email) -> member_id` resolves an *email* to a member seat — it isn't shaped to validate "does this `member_id` belong to this group," which is what `from_member_id`/`to_member_id` validation actually needs. `SettlementService` instead composes a `GroupService` instance and calls `require_membership(group_id, actor_email)` for the caller-permission check (exactly as the ticket describes), and does the from/to membership check with its own direct `GroupMember` query. Flagging as drift since the ticket's text assumed a `resolve_member` shape that TS-GRP-102 didn't end up building that way — worth a one-line clarification in the ticket/spec rather than stretching `resolve_member`'s contract to fit.
- **"Member not in group" returns `400`, not `403`.** The ticket allowed either ("→ else `400`/`403`"). Chose `400` because it's a malformed request (a `member_id` argument that doesn't belong to the target group), distinct from the caller-permission `403` used for "you aren't a member of this group at all."
- **`DELETE .../settlements/{id}` has no admin restriction** — any active group member can undo a settlement. Not specified either way in the ticket; matches the spec's established "any member can edit/delete" ethos for group-scoped mutations (§5.2) applied consistently here.
- **Amount is rounded to 2 decimals in the service** (`round(float(amount), 2)`) before persisting, so behavior is deterministic across SQLite (no native `NUMERIC` precision enforcement) and Postgres (which would round on insert) — avoids the two dialects silently diverging on a value like `10.999`.
- **Spec-vs-built-schema note (no action taken, out of this ticket's scope):** the spec's illustrative DDL (§6.1) shows `CHECK (amount > 0)` on `settlements`, but TS-GRP-101's actual migration/ORM only added the `from_member_id <> to_member_id` check, not an amount check. The `amount > 0` rule is enforced at the service layer here (matching this ticket's acceptance criteria, which only ties the DB `CHECK` to the from/to constraint). If a DB-level guard is wanted too, that's a schema change belonging to TS-GRP-101 territory, not this ticket.

## Scope

Record, list, and undo settlements — payments between two members that move balances but are **never** counted as spend (rule TS-GRP-R2). Settlements are their own table, not fake expenses (§6.5), so they must **not** touch `expenses` or any analytics aggregation.

Endpoints:
- `POST /groups/{group_id}/settlements` — record `{from_member_id, to_member_id, amount, method?, settled_at?, notes?}`; partial payments allowed.
- `GET /groups/{group_id}/settlements` — history (most recent first).
- `DELETE /groups/{group_id}/settlements/{id}` — undo.

## Files it will touch

- **New:** `services/settlement_service.py` — `SettlementService(db: Session)` (create/list/delete), consistent with existing service style.
- `models/api_models.py` — `RecordSettlementRequest`, `SettlementDTO`. No `user_id` field; `created_by` is filled from JWT `sub`.
- `api/groups_routes.py` (from TS-GRP-102) — add the three routes; reuse `require_membership` guard and `resolve_member` helper.
- Reuse `GroupService.resolve_member` to validate that `from_member_id`/`to_member_id` belong to the group.

## Acceptance criteria

- `POST` persists a row with `from_member_id != to_member_id` (DB `CHECK` enforces; service returns `400` on equal ids before hitting the DB), `amount > 0`, `created_by = JWT sub`. Defaults `settled_at = now()` when omitted.
- Both members must belong to the group → else `400`/`403`.
- `GET` returns the group's settlements ordered by `settled_at` desc; non-members get `403`.
- `DELETE` removes the settlement (Phase 1 = hard delete; activity-feed logging is Phase 2 per §5.5 — do not block on it).
- **No analytics impact:** creating/deleting a settlement does **not** call `AnalysisService.invalidate_cache()` for spend totals and does not create any `expenses` row. A test asserts spend analytics are unchanged before/after a settlement.
- Amounts are cent-precise (`Numeric(12,2)`); partial amounts (less than owed) are accepted.

## Dependencies

- **TS-GRP-101** (settlements table), **TS-GRP-102** (`require_membership`, `resolve_member`).
- Consumed by **TS-GRP-104** (`BalanceService` includes the settlement terms of §7.1).

## Test requirements

- New `tests/test_settlements_api.py` (SQLite, `TestClient`).
- Cases: record settlement between two members (happy path); `from == to` → `400`; member not in group → `400`/`403`; non-member caller → `403`; list ordering; undo removes it.
- Invariant test: record a settlement, then call `/analysis` (personal scope) and assert `total_expenses` is identical to before — settlements are not spend (TS-GRP-R2).
