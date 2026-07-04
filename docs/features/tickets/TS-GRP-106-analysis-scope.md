# TS-GRP-106 — AnalysisService scope support + cache key + `group_id IS NULL` guard

**Phase:** 1 · **Build order:** 6th · **Spec:** §8.4, §9.1, §13 · **⚠️ Rollout gate for `GROUPS_ENABLED`**

## Scope

Make `/analysis` scope-aware (`personal | combined | groups`, plus single-`group_id`) and, critically, **retrofit the existing personal query with a `group_id IS NULL` guard** so group expenses (which carry `expenses.user_email = creator`) are not double-counted the moment they exist.

This ticket is **not purely additive** — it edits the current single-leg query in `services/analysis_service.py`.

## Files it will touch

- `services/analysis_service.py`:
  - Add `scope: str = "personal"` and `group_id: str | None = None` params to `analyze()` (default `personal` preserves legacy behavior for old clients — §13).
  - **Personal leg guard:** add `Expense.group_id.is_(None)` to the base `filters` list (currently `filters = [Expense.user_email == user_id]`, `analysis_service.py:67`) for `personal`/`combined` scopes.
  - **My-share leg:** for `combined`/`groups`, add a second aggregation over `expense_splits` joined to `group_members` (`gm.user_email == user_id`) and `expenses` (for `category_id`, date filters), summing `amount_owed` grouped by `category_id`; merge into the same category-totals / top-5 / monthly-trend / detail pipeline. **Must use the existing `is_sqlite` branching** for all date functions (`analysis_service.py:74-85, 114-117`) — the spec's raw SQL is Postgres-only.
  - **Cache key:** extend the current **5-tuple** `(user_id, year, month, start_date, end_date)` (`analysis_service.py:48-54`) to a **7-tuple** by appending `scope, group_id`. Update the `_CACHE` type annotation (`analysis_service.py:28`) to match.
  - Populate new response fields: `scope`, `spend_breakdown{personal, group_share}`, and (for combined/groups) `group_summaries[]` (`{group_id, name, my_share, i_paid, group_total, my_balance}`). Reuse `BalanceService` (TS-GRP-104) for `my_balance`.
- `models/api_models.py`:
  - Extend `AnalysisResponse` with **optional** `scope`, `spend_breakdown`, `group_summaries` (Optional so old-client responses/tests stay valid).
  - `AnalysisFilterInfo` currently lacks `start_date`/`end_date`/`scope`/`group_id` — add them as optional if surfacing.
- `api/routes.py` — `analysis()` endpoint (`routes.py:399-419`): add `scope` and `group_id` query params, pass through to `analyze()`. **Do not add a `user_id` param** (JWT `sub` already identifies the user).
- Note: the dead `_ANALYSIS_CACHE` dict in `routes.py:63-68` is unused (the real cache lives in `AnalysisService`); optionally delete it while here.

## Acceptance criteria

- `GET /analysis` **without** `scope` returns byte-identical results to today for a personal-only user (default `scope=personal`, back-compat §13) — verified against existing `tests/test_analytics_api.py`.
- With a group expense authored by the user present: `scope=personal` excludes it entirely (guard works); `scope=combined` counts only the user's `amount_owed` share (never the full amount); `scope=groups` shows only shares. **No double-counting** in any scope.
- `spend_breakdown.personal + spend_breakdown.group_share == total_expenses` for `combined`.
- `group_summaries[]` present for combined/groups with correct `my_share`/`i_paid`/`group_total`/`my_balance`.
- Cache correctness: two requests differing only in `scope` or `group_id` do **not** collide (distinct 7-tuple keys); writes still invalidate via `invalidate_cache()`.
- Works on both SQLite (unit tests) and Postgres (e2e).

## Dependencies

- **TS-GRP-101** (`expenses.group_id`, `expense_splits`), **TS-GRP-104** (`BalanceService`, group expenses to aggregate).
- **Gates TS-GRP-111:** `GROUPS_ENABLED` must not be enabled in any env that can write group expenses until this ticket is merged, or personal/combined analytics double-count.

## Test requirements

- Extend `tests/test_analytics_api.py`: legacy no-scope call unchanged; add scope matrix (personal excludes group, combined = personal + share, groups = shares only) with a seeded group expense + splits.
- Double-count regression: author a group expense as user X, assert `scope=personal` total equals X's personal-only total (group expense excluded).
- Cache test: assert distinct results cached per `(scope, group_id)`.
- PG parity in `run_e2e_pg_tests.sh` (`tests/test_analytics_e2e_pg.py` pattern) to exercise `extract`/`to_char` + the `expense_splits` join on real Postgres.
