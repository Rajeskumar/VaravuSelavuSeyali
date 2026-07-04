# TS-GRP-103 — SplitEngine (pure functions + exhaustive unit tests)

**Phase:** 1 · **Build order:** 1st (pulled ahead — zero DB dependency, the risk center) · **Spec:** §3.4, §3.5, §7.3 · **Status:** ✅ Completed

## Scope

A pure, dependency-free module that resolves split *inputs* into cent-exact per-member `amount_owed` values. No database, no FastAPI, no ORM imports — just numbers in, numbers out. This is the single source of truth for split math (clients only preview; §7.3).

**Phase 1 split types only:** `equal`, `exact`, `percentage`. (`shares`, `adjustment`, `itemized` are Phase 2 — leave clean extension points but do not implement.)

Responsibilities:
- Compute raw shares at 4-decimal precision per §3.4.
- Round to cents, compute residual `r = amount − Σ rounded`, distribute `r` one cent at a time by **largest fractional remainder**, ties broken by **member UUID ascending** (§3.5).
- Validate invariants (§3.3): `sum(amount_owed) == amount` exactly; percentages sum to 100; exact amounts sum to total. Raise a typed domain error (not `HTTPException`) with per-entry detail on failure.
- Single-payer validation helper for Phase 1: `sum(payers.amount_paid) == amount` (single payer = full amount).

## Files it will touch

- **New:** `varavu_selavu_app/varavu_selavu_service/services/split_engine.py` — pure functions/dataclasses. Use `decimal.Decimal` for money math (avoid float drift); accept/return plain types so callers can adapt.
- **New:** `varavu_selavu_app/tests/test_split_engine.py` — unit tests (no DB fixtures needed).
- Define a `SplitError` (or reuse a lightweight domain exception) in the same module; the route layer (TS-GRP-104) maps it to `400` with details.

> Keep this module import-clean: it must not import `db.*`, `sqlalchemy`, or `fastapi`. That is what lets it be tested in isolation and reused by both the JSON and itemized paths later.

## Acceptance criteria

- `resolve_split(amount, split_type, entries, member_ids)` returns a list of `{member_id, amount_owed, basis_type, basis_value}` whose `amount_owed` sum equals `amount` to the cent for all three Phase 1 types.
- Residual-cent allocation is deterministic and matches §3.5 (largest remainder, tie-break by member UUID ascending). Example: `$90 / 3 equal` → `30/30/30`; `$100 / 3 equal` → `33.34/33.33/33.33` with the extra cent going to the lowest UUID.
- `percentage` entries not summing to 100 → `SplitError` with per-entry detail; `exact` entries not summing to `amount` → `SplitError`.
- Subset participation (E8) supported: only listed members receive splits; zero-share members are omitted (E9), never stored as `0`.
- No floating-point residue: verified by property-style tests over random amounts/participant counts.

## Dependencies

- **None.** Can start immediately, in parallel with TS-GRP-101.

## Test requirements

- New `tests/test_split_engine.py`, pure unit tests (fast, no `client`/`db` fixtures).
- Deterministic cases: `equal`/`exact`/`percentage` happy paths; the `$100/3` and `$0.01/3` rounding edge cases; tie-break ordering by UUID.
- Invariant/property tests: for N random `(amount, participant_count)` pairs, assert `sum == amount` exactly and every share `>= 0`.
- Negative cases: percentages ≠ 100, exact ≠ total, empty participant list → typed error.
- Must pass under the existing `pytest` setup on SQLite CI (no DB touched, so dialect is irrelevant here).
