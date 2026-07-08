# TS-GRP-135 — Materialized group balances (performance, conditional)

**Phase:** 3 (optional/perf-triggered) · **Spec:** §6.5 · **Status:** 📋 Planned — build only if profiling justifies it

## Scope

§6.5's own design rationale: *"Balances computed, not stored (v1). With per-group data volumes (hundreds of rows), on-request computation with the existing 60s in-memory analysis cache is sufficient. A materialized `group_balances` table is a Phase-3 optimization **if needed**."* This ticket should **not** be picked up speculatively — it's a contingency plan, not a scheduled feature. Before starting, confirm via actual production metrics (query timing on `BalanceService.get_balances` for the largest real groups, or load-test synthetic data at 10x the "hundreds of rows" assumption) that on-request computation has become a measurable problem. If nothing has, close this ticket as not-needed rather than building it preemptively.

## If triggered — scope

- **New:** `group_balances` table (per member, per group: cached `net` amount + `updated_at`), populated/refreshed on every write that affects balances (expense create/edit/delete, settlement create/delete) rather than computed fresh on every `GET /balances` read.
- `varavu_selavu_app/varavu_selavu_service/services/balance_service.py` — `get_balances` reads from the materialized table when fresh (`updated_at` within some staleness tolerance, or always-fresh if every mutation synchronously updates it — recommend synchronous update-on-write, since balances are exactly the kind of number where a stale UI actively erodes trust, unlike analytics which already tolerates a 60s cache per the existing `AnalysisService` design).
- Every write path in `GroupExpenseService`/`SettlementService`/**TS-GRP-113/114/115** (shares, multi-payer, itemized) must call a new `BalanceService.recompute_and_store(group_id)` after committing — this is the highest-risk part of this ticket: **every single place that can change a group's balances must remember to call it**, which is exactly the kind of thing that silently drifts out of sync over time as new mutation points get added (this feature already has ~10 mutation call sites across Phases 1-3 tickets). Strongly prefer a single choke point (e.g. a SQLAlchemy `after_commit` event hook scoped to the relevant tables) over scattering explicit calls through every service method, specifically to avoid this drift risk.

## Acceptance criteria (if built)

- `GET /balances` response is byte-identical to the on-request-computed version at all times (this is a caching/perf change, not a behavior change — any divergence is a bug).
- A missed recompute call anywhere in the write paths would be caught by a comprehensive integration test that exercises every mutation type and asserts the materialized table matches a fresh from-scratch computation after each one — build this test **first**, before the caching mechanism, so it can catch omissions during implementation rather than after.
- Fallback: if the materialized row is ever missing or detectably stale (e.g. a migration gap), `get_balances` recomputes on-the-fly rather than serving wrong data — never trust the cache blindly.

## Dependencies

- All balance-affecting tickets (**TS-GRP-104, 105, 113, 114, 115, 118**) — this is architecturally a capstone ticket that must come after the full write-path surface is known, not before.

## Test requirements (if built)

- New `varavu_selavu_app/tests/test_materialized_balances.py`: parity test across every mutation type (the "catch drift" test described above is the real deliverable of this ticket, arguably more valuable than the caching mechanism itself).
