# Testing standard

## Pyramid and commands
| Layer | Tool | Command |
|---|---|---|
| Backend unit/API | pytest, in-memory SQLite (`tests/conftest.py`, user `test@user.com`) | `make test-backend` |
| Backend Postgres-only behaviour | `tests/*_e2e_pg.py`, needs `E2E_DATABASE_URL` | `varavu_selavu_app/run_e2e_pg_tests.sh` |
| Web | Jest + RTL | `make test-web`, `make lint-web`, `make typecheck-web` |
| Mobile | Jest + tsc | `make test-mobile`, `make typecheck-mobile` |
| Browser/API E2E | Playwright (`qa/`) | `make qa-smoke`, `qa-regression`, `qa-api` |
| Dependencies | pip-audit / npm audit | `make audit-all` |
Aggregates: `make unit-check`, `make release-check`, `make release-check-full`. Wrapper: `scripts/quality/verify.sh`.

## What a change needs
- **Bug fix:** a test that fails before and passes after.
- **New logic:** unit tests on the pure engine/utility; happy path + each business-rule edge (zero, negative, rounding, member removed, archived group, flag off).
- **New/changed endpoint:** API test covering success, validation failure, **unauthorized (no token) and forbidden (other user's data)**.
- **New UI:** RTL test by role/name for the main flow, empty/error states and a11y name; E2E only for critical journeys.
- **Migration/Postgres-specific SQL:** a `_pg` test.
- **Money:** assert exact `Decimal` results, never approximate.

## Constraints
- The qa suite runs at real auth rate limits (5 logins/min, 5 registrations/hour per backend process). Don't add real logins/registrations to qa tests; stub or use the API; restart the backend between local `release-check-full` runs.
- Tests must be deterministic: no network, no wall-clock dependence (freeze dates), no order coupling.
- Don't weaken or delete a failing test to pass; fix the cause or state why the expectation changed.

## Test review checks
Do tests assert behaviour (not implementation)? Would they fail if the fix were reverted? Are mocks hiding the real boundary (auth, DB constraint)? Are rate-limit and CSRF paths covered where touched?
