# TS-GRP-131 — Multi-currency groups

**Phase:** 3 · **Spec:** §5.1, §14 (E10), §15 (Non-Goals v1) · **Status:** 📋 Planned

## Scope

Today `groups.currency` (`db/models.py:148`) is fixed at creation and never varies — every expense in a group is implicitly assumed to be in the group's currency, and `Expense.currency` (`models.py:35`, default `"USD"`) is set but never reconciled against the group's. E10: "Group currency fixed at creation, USD default; mixed-currency groups are Phase 3 (Open-Exchange-Rates-style conversion)." This is explicitly the largest, most open-ended ticket in this backlog — scope it as a **foundation**, not a full mixed-currency UX, and expect follow-on work.

### Recommended phasing within this ticket

1. **Store, don't yet convert.** Allow a group expense's `currency` to differ from `groups.currency`; at creation time, fetch and persist the exchange rate (`Expense` gains `fx_rate_to_group_currency: Numeric(12,6)`, nullable — null means "same currency, no conversion needed") from an external FX API, snapshotted at expense-creation time (never recompute historically — an expense from 6 months ago must always convert at the rate that applied then, matching how the spec frames this as "Open-Exchange-Rates-style").
2. **Convert for display, not for storage.** `expense_splits.amount_owed`/`expense_payers.amount_paid` continue to be stored in the **expense's own currency** (unchanged split math — `SplitEngine` doesn't need to know about currency at all). Conversion to the group's home currency happens only at read time, in `BalanceService`/`AnalysisService`, using each expense's stored `fx_rate_to_group_currency`.
3. **New `FxRateService`** — thin wrapper around an external rate provider (the spec names "Open Exchange Rates" as the reference; pick a provider with a free/cheap tier and an API-key-based `core/config.py` setting, matching how other external integrations in this codebase are configured — check `core/config.py` for the existing pattern before adding a new one). Cache rates (daily granularity is sufficient; this is not a trading app) to avoid a live API call per expense.

## Files it will touch

- **New:** Alembic migration adding `expenses.fx_rate_to_group_currency` (nullable `Numeric(12,6)`).
- `varavu_selavu_app/varavu_selavu_service/db/models.py` — add the column to `Expense`.
- **New:** `services/fx_rate_service.py` — `get_rate(from_currency, to_currency, as_of_date) -> Decimal`, with a small local cache table or in-memory TTL cache (decide based on call volume; a `fx_rates` table keyed by `(date, from_currency, to_currency)` is more robust than an in-memory cache that resets on deploy — recommend the table given this codebase's existing preference for DB-backed state over ephemeral caches, e.g. the insights aggregation tables).
- `varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py` — `create_expense` accepts an optional `currency` differing from the group's; when it differs, call `FxRateService.get_rate` and stamp `fx_rate_to_group_currency`.
- `varavu_selavu_app/varavu_selavu_service/services/balance_service.py` — `_compute_nets`/`get_balances` must convert each expense's payer/split amounts to the group's home currency before summing, using the stored per-expense rate — **this is a real behavior change to existing math**, not additive; regression-test the single-currency case exhaustively to make sure `fx_rate = 1` (or `NULL` treated as `1`) produces byte-identical results to today.
- `varavu_selavu_app/varavu_selavu_service/services/analysis_service.py` — the "my share" leg (§9.1) similarly needs FX-aware conversion when rolling group shares into the user's home-currency combined total (which currency is "home" for an individual user who's in multiple groups with different currencies? — recommend the user's own default currency, likely inferred from their most common personal-expense currency or a new profile setting; this is a genuine open product question, flag it rather than silently picking one).
- **Web/Mobile:** currency selector on group creation/settings (**TS-GRP-118**); per-expense currency override in `AddExpenseForm.tsx`/`AddExpenseScreen.tsx` when adding to a group; display both original and converted amounts on expense rows when they differ (mirror the existing "my share primary, full amount secondary" pattern already used for group expense rows).

## Acceptance criteria

- A group expense created in a non-group currency stores the FX rate at creation time and never recomputes it retroactively.
- `Σ net(m) == 0` invariant holds in the group's home currency after conversion (verify with a scripted 2-currency scenario).
- Existing single-currency groups are completely unaffected — `fx_rate_to_group_currency = NULL` (or `1`) is a no-op path, byte-identical to pre-ticket behavior.
- Combined personal analytics (§9.1) correctly convert group shares in foreign currencies into the user's home currency.
- FX rate lookups are cached (DB-backed) — no live external API call on every expense read.

## Dependencies

- **TS-GRP-104**, **TS-GRP-106** (both touched by the conversion logic).

## Test requirements

- New `varavu_selavu_app/tests/test_fx_rate_service.py`: rate caching, historical-rate-snapshot immutability.
- Extend `varavu_selavu_app/tests/test_balances.py`: mixed-currency group scenario, single-currency regression (byte-identical to pre-ticket fixtures).
- Extend analysis tests for the combined-view FX conversion path.

## Note

Given the genuine product ambiguity here (home-currency definition, provider choice, whether historical group totals should ever be shown in more than one currency at once), **recommend a short product/design check-in before implementation starts**, not just an engineering read of this ticket.
