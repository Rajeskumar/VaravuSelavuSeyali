# TS-GRP-111 — Feature flag, e2e tests, staged rollout

**Phase:** 1 · **Build order:** 11th (last) · **Spec:** §13.4, §16 (exit criteria)

## Scope

Gate the entire feature behind a `GROUPS_ENABLED` flag, add the Phase-1 end-to-end tests that prove Priya's stories 1/2/4/5/6, and confirm old clients are unaffected. This is the ticket that flips the feature on.

**⚠️ Rollout gate:** `GROUPS_ENABLED` must stay **OFF** until TS-GRP-106 is merged (the `group_id IS NULL` analytics guard). Turning it on earlier would double-count group expenses in personal/combined analytics (§9.1).

## Files it will touch

- `core/config.py` — add `GROUPS_ENABLED: bool = False` to `Settings` (same pattern as existing flags/settings like `ANALYSIS_CACHE_TTL_SEC`, `OCR_ENGINE`). Default OFF.
- **Backend gating:** guard all group routers/endpoints (TS-GRP-102/104/105/110) so they return `404`/`403` when the flag is off. Cleanest is a dependency (e.g. `require_groups_enabled`) added to `api/groups_routes.py`'s router; the `/analysis` scope params remain accepted but behave as personal-only when off (they already default to `personal`).
- **Flag exposure to clients:** add the flag to a client-visible config surface (e.g. a field on an existing bootstrap/health/profile response, or a small `GET /config` returning `{groups_enabled}`) so web (TS-GRP-108) and mobile (TS-GRP-109) can hide entry points. Pick the least-invasive existing endpoint.
- Web `varavu_selavu_ui/src` + mobile `varavu_selavu_mobile/src` — read the flag and hide Groups nav/filters/toggles when off (the hiding logic itself lives in 107/108/109; this ticket provides the flag source + verifies it).
- Docs: update `docs/FEATURE_STATUS.md` (per the spec's closing note) to add the TS-GRP-1xx tickets and their status.

## Acceptance criteria

- With `GROUPS_ENABLED=false` (default): all `/groups*`, `/devices*` routes are unreachable (`404`/`403`); `/analysis` behaves exactly as today; no Groups UI is visible on web or mobile; existing test suites pass unchanged.
- With `GROUPS_ENABLED=true`: full Phase-1 flow works end-to-end.
- Old mobile/web builds (that never send `scope`) keep working against a flag-on backend — `/analysis` defaults to `scope=personal` (§13.2).
- **Exit criteria (from §16):** Priya's stories **1, 2, 4, 5, 6** pass end-to-end; invariant tests green (`Σ splits == amount`, `Σ net == 0`); old clients unaffected.

## Dependencies

- **All Phase-1 tickets (101–110).** This is the integrating ticket.
- Hard ordering: do not enable the flag in any shared/prod-like env until **TS-GRP-106** is merged.

## Test requirements

- **New e2e suite** `tests/test_groups_e2e.py` (SQLite for CI) + a PG variant wired into `run_e2e_pg_tests.sh` (mirror `tests/test_analytics_e2e_pg.py`):
  - Story 1: create group + add registered + placeholder member + invite.
  - Story 2: create equal-split group expense; assert creator's combined `/analysis` shows only their share under the right category (double-count guard verified end-to-end).
  - Story 4: balances reflect payers/splits; `Σ net == 0`.
  - Story 5: record settlement; balances update; **spend analytics unchanged** (TS-GRP-R2).
  - Story 6: combined dashboard number == personal + group shares.
- **Flag tests:** with flag off, group routes `404`/`403` and `/analysis` == legacy; with flag on, routes live.
- **Back-compat test:** a no-`scope` `/analysis` request returns identical shape/values to the pre-feature baseline.
- Full existing suite (`tests/test_analytics_api.py`, `test_expenses_api.py`, `test_auth.py`, …) must remain green.
