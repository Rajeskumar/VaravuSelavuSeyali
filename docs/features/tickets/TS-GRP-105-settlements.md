# TS-GRP-105 — Settlements (record / list / undo)

**Phase:** 1 · **Build order:** 4th (before the balances endpoint — `BalanceService.net(m)` references settlement rows) · **Spec:** §3.1, §3.3, §5.3, §7.1, §8.3

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
