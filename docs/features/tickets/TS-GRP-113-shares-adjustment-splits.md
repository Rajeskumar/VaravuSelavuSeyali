# TS-GRP-113 — SplitEngine: `shares` and `adjustment` split types

**Phase:** 2 · **Spec:** §3.4, §3.5, §7.3 · **Status:** 📋 Planned

## Scope

Extend `SplitEngine.resolve_split` (backend-only; no DB/schema change) to support the two remaining Phase-1-deferred split types from §3.4:

- **`shares`** — each entry carries an integer (or decimal) `value` = share count. `raw_amount(member) = amount * value / Σ(values)`. Example: $90 across shares 2/1/1 → $45.00 / $22.50 / $22.50.
- **`adjustment`** — each entry carries a signed `value` = a per-person adjustment against an equal base. `base = (amount − Σ(adjustments)) / n`; `raw_amount(member) = base + adjustment(member)`. Example: $90, 3 people, Alice +$12 → base = (90−12)/3 = $26; Alice = $38, Bob = $26, Carol = $26 (sums to $90).

Both types reuse the existing largest-remainder rounding pass (`services/split_engine.py:138-175`) and the existing zero-share filter (E9) unchanged — only the `raw_shares` computation branch is new.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/split_engine.py` — add `elif split_type == "shares":` and `elif split_type == "adjustment":` branches inside `resolve_split` (currently only `equal`/`exact`/`percentage` are accepted at `split_engine.py:54`). Validation:
  - `shares`: reject non-positive values, reject `Σ(values) <= 0`, reject non-integer values (Splitwise/spec model treats shares as whole counts, e.g. "couples = 2 shares" — reject fractional shares with a clear `SplitError`).
  - `adjustment`: every participating member must have an entry (adjustment defaults to `0` if a member is simply "included" without a custom amount — the caller/UI is responsible for sending `value: 0` entries for unadjusted participants); reject if `Σ(adjustments) > amount` (would make `base` negative) with a `SplitError` naming the offending total.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `GroupSplitConfig.type` docstring at `api_models.py:395-397` currently says "equal|exact|percentage (Phase 1)"; update to note `shares|adjustment` are now accepted. No field shape change — `GroupSplitEntry.value` already exists and is reused (share count or adjustment amount).
- `varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py` — no code change expected; `_validate_and_resolve` (`group_expense_service.py:56-73`) already passes `split_type`/`split_entries` straight through to `resolve_split` with no type allowlist of its own. Confirm this with a test rather than assuming.
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — no change; `SplitError` → `400` mapping already exists for expense create/update.

## Acceptance criteria

- `resolve_split(Decimal("90"), "shares", [{"member_id": a, "value": 2}, {"member_id": b, "value": 1}, {"member_id": c, "value": 1}])` → `45.00 / 22.50 / 22.50`, sum exact to the cent.
- `resolve_split(Decimal("90"), "adjustment", [{"member_id": a, "value": 12}, {"member_id": b, "value": 0}, {"member_id": c, "value": 0}])` → `38.00 / 26.00 / 26.00`.
- Non-integer share value → `400 SplitError` with details.
- `Σ(adjustments) > amount` → `400 SplitError` naming the total (mirrors the existing `"Percentages do not sum to 100"` / `"Exact amounts do not sum to total"` error shape at `split_engine.py:102-136`).
- Residual-cent distribution for both new types uses the same largest-remainder-by-member-UUID-ascending tie-break as the existing three types (no special-casing).
- `POST /groups/{group_id}/expenses` with `split.type = "shares"` or `"adjustment"` persists correctly through `GroupExpenseService.create_expense` — this is an integration check, not just a unit test, since nothing in `group_expense_service.py` currently exercises these types.

## Dependencies

- **TS-GRP-103** (`SplitEngine` itself), **TS-GRP-104** (`GroupExpenseService`/routes it flows through for the integration check).

## Test requirements

- Extend `varavu_selavu_app/tests/test_split_engine.py` with `shares` and `adjustment` cases: the two worked examples above, a non-integer-shares rejection case, an adjustment-exceeds-amount rejection case, a subset-of-members case (E8), and a randomized property test (random amounts/share counts/adjustments still sum to the cent after rounding — mirror whatever property-test pattern the existing `equal`/`exact`/`percentage` tests already use in this file).
- Extend `varavu_selavu_app/tests/test_group_expenses_api.py` with one `POST /groups/{id}/expenses` case per new type, asserting the persisted `expense_splits.amount_owed` values and `basis_type`/`basis_value` provenance.
