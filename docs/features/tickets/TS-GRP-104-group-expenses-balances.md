# TS-GRP-104 — Group expense endpoints + BalanceService

**Phase:** 1 · **Build order:** 5th · **Spec:** §5.2, §7.1, §8.2, §8.3, §8.5, §8.6, §14 (E2, E8, E9)

## Scope

Create/read/edit/delete group expenses with **single-payer** and `equal`/`exact`/`percentage` splits, and compute per-group balances (non-simplified). This is where TS-GRP-103 (`SplitEngine`) meets the DB.

Endpoints:
- `POST /groups/{group_id}/expenses` — create with payer + split config (§8.5 `GroupExpenseRequest`).
- `GET /groups/{group_id}/expenses?limit=&offset=` — paginated; each row includes **my share** + payer summary.
- `PUT /groups/{group_id}/expenses/{expense_id}` — edit expense/splits; balances recompute (any member may edit — decision §17.2; push notify is TS-GRP-110).
- `DELETE /groups/{group_id}/expenses/{expense_id}` — delete.
- `GET /groups/{group_id}/balances` — net balances per member + suggested transfers (**non-simplified** in Phase 1; greedy simplify is Phase 2 §7.2).

**Explicitly out of Phase 1 (do not build):** multiple payers, `shares`/`adjustment`/`itemized`, `with_items` group path, `move_to_group`, simplify-debts, activity-feed writes.

## Files it will touch

- **New:** `services/group_expense_service.py` — `GroupExpenseService(db: Session)`. Persists into the existing `expenses` table with `group_id` set + `split_type`, then writes `expense_payers` (single row, `amount_paid == amount`) and `expense_splits` (from `SplitEngine.resolve_split`). Store `basis_type`/`basis_value` provenance (§6.5).
- **New:** `services/balance_service.py` — `BalanceService(db: Session)` implementing §7.1 `net(m)` = Σpaid − Σowed + Σsettlements_sent − Σsettlements_received; returns members + net; Phase-1 `transfers` are the literal pairwise accrual (`simplified=false`).
- `services/split_engine.py` (TS-GRP-103) — consumed, not modified.
- **Date handling (grounded):** reuse `ExpenseService`'s `MM/DD/YYYY → datetime` conversion (`services/expense_service.py:13-24`) for the JSON path so group and personal dates behave identically. Do **not** silently diverge from it (see §8.5 note on the two write paths).
- `models/api_models.py` — `GroupExpenseRequest` (date `MM/DD/YYYY` pattern like `ExpenseRequest`, `payers[]`, `split{type,entries[]}`; **no `user_id`**), `GroupExpenseRow` (adds `my_share`, `payer_summary`), `BalanceResponse` (`members[]`, `transfers[]`, `simplified`).
- `api/groups_routes.py` — add routes; reuse `require_membership`/`resolve_member`. Map `SplitError` (from TS-GRP-103) → `400` with per-field details (§8.6).
- On create/edit/delete, call `AnalysisService.invalidate_cache()` (as existing `/expenses` routes do at `api/routes.py:148,214,254`) so combined analytics refresh.
- Wire the real balance-zero checks back into TS-GRP-102's leave/remove/delete (replace the interim guard).

## Acceptance criteria

- `POST` with `equal`/`exact`/`percentage` persists `expenses.group_id`, one `expense_payers` row, and N `expense_splits` rows; `Σ amount_owed == amount` to the cent (invariant §3.3); `Σ amount_paid == amount`.
- Split inputs that don't reconcile (percent≠100, exact≠total) → `400` with per-entry detail (from `SplitEngine`).
- Subset participants supported (E8); zero-share members omitted (E9).
- `GET` list returns each expense with the caller's `my_share` (their `expense_splits.amount_owed`, or `0`/absent if not a participant) and a payer summary; paginated like the existing `list_expenses` (`limit`/`offset`, `next_offset`).
- `PUT` by **any** member re-resolves splits and rewrites `expense_splits`/`expense_payers` atomically; balances recompute (E2: allowed even after a settlement; no settlement auto-modified).
- `DELETE` removes the expense; `expense_splits`/`expense_payers` cascade (per TS-GRP-101 FKs).
- `GET /balances`: `Σ net(m) == 0` across all members always; matches hand-computed values for a scripted scenario incl. one settlement; `simplified=false`.
- Non-member access to any of these → `403`.

## Dependencies

- **TS-GRP-101** (tables + `expenses.group_id`), **TS-GRP-102** (membership guards), **TS-GRP-103** (`SplitEngine`), **TS-GRP-105** (settlements table feeds `BalanceService`).

## Test requirements

- New `tests/test_group_expenses_api.py` and `tests/test_balances.py` (SQLite, `TestClient`).
- Expense cases: create equal/exact/percentage; reconciliation failure → `400`; `my_share` correctness for participant vs non-participant; edit by a non-author member re-splits correctly; delete cascades splits/payers.
- Balance cases: multi-member scenario with payers + splits + one settlement → assert exact `net(m)` per member and `Σ net == 0`; balance changes after an edit (E2).
- Invariant test reused from TS-GRP-103 at the API layer: random amounts still sum to the cent after persistence + read-back.
- Dual-dialect: any raw/`func`-based aggregation added must branch like `AnalysisService` (`is_sqlite`) so tests pass on SQLite and PG e2e (`run_e2e_pg_tests.sh`).
