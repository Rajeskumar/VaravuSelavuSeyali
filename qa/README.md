# TrackSpense QA Framework

Automated smoke, functional, regression, API, negative-path, auth/session and
financial-calculation testing for TrackSpense — Playwright + TypeScript. See
[`TEST-PLAN.md`](./TEST-PLAN.md) for scope/strategy and [`TEST-CASES.md`](./TEST-CASES.md)
for the full test inventory.

## Architecture

```
qa/
├── e2e/                    Browser tests (Page Object Model)
│   ├── pages/               One class per screen — locators + actions, no assertions
│   ├── fixtures/             Playwright test extensions: auth (primaryApi/secondaryApi),
│   │                          QA personas, deterministic test-data seeds
│   ├── helpers/               env config, API client, test-data tagging, cleanup, the
│   │                          migrated responsive-rendering assertions
│   ├── setup/                globalSetup/globalTeardown + the `setup` project's real
│   │                          UI login (auth.setup.ts)
│   ├── test-data/             Fixed JSON datasets for exact-calculation assertions
│   ├── auth/                 storageState output (gitignored)
│   └── tests/                 Spec files, organized by feature, tagged @smoke/@regression/etc.
├── api/                    Pure API tests (Playwright's own `request` fixture, no browser)
│   ├── tests/, helpers/, fixtures/    helpers/fixtures just re-export e2e/'s — one
│   │                                    implementation, not two copies
├── scripts/bootstrap-local-db.sh    Disposable local Postgres for the backend under test
├── reports/                 HTML report, JUnit XML, traces, videos, screenshots (gitignored)
└── playwright.config.ts    One config, multiple projects (see below)
```

**Why one `playwright.config.ts`, not separate configs per suite type**: projects
(`setup`, `api`, `chromium`, `firefox`, `webkit`, `mobile-iphone`, `prod-smoke`) give one
`npx playwright test --project=X` entry point instead of juggling multiple config files.

**Why one shared `qa/e2e/helpers/api.helper.ts`** for both the browser and API suites:
the CSRF double-submit header logic and domain helpers (createExpense, createGroup, ...)
would otherwise drift between two copies. `qa/api/helpers/index.ts` and
`qa/api/fixtures/index.ts` are just re-exports.

## Installation

```bash
cd qa
npm ci
npx playwright install --with-deps chromium   # add firefox webkit for full regression
cp .env.example .env   # then edit as needed
```

Or, from the repo root: `make install-qa`. The root `Makefile` has a shortcut for every
`npm run qa:*` script below (`make qa-smoke`, `make qa-regression`, `make qa-api`, ...),
plus two composites: `make qa-all` (smoke → regression → API, same order as CI) and
`make release-check` (the backend's own `pytest` suite + `qa-all` — see "Before deploying
to prod" below). `make -n <target>` shows what any of them actually run.

## Configuration (`.env`)

| Var | Meaning | Default |
|---|---|---|
| `BASE_URL` | Web app under test | `http://localhost:3000` |
| `API_BASE_URL` | Backend under test | `http://localhost:8080` |
| `PROD_BASE_URL` / `PROD_API_BASE_URL` | Read-only smoke target only | `expense.cerebroos.com` / `trackspense-api.cerebroos.com` |
| `QA_USER_PASSWORD` | Shared password for the two QA personas | see `.env.example` |
| `QA_DATABASE_URL` | Same Postgres the backend under test uses — marks the QA personas email-verified (see below); group tests 403 without it | unset |
| `ALLOW_PROD_WRITES` | Hard safety gate — leave `false` | `false` |
| `CI` | Set by GitHub Actions; affects retries/workers | unset locally |

Never commit `.env` (it's gitignored) or real credentials.

## Running locally

1. **Database + backend** — from `qa/`:
   ```bash
   npm run qa:db:bootstrap    # docker Postgres + schema + alembic upgrade head
   ```
   Then start the backend (from `varavu_selavu_app/`) with the env the script prints —
   **`AUTH_COOKIE_SECURE=false` is required**, not optional: the backend's default
   marks auth cookies `Secure`, which browsers refuse to send over plain
   `http://localhost`, and every login would silently "succeed" while every request
   after it looked logged out.

   **Also leave `MAIL_USERNAME`/`MAIL_PASSWORD` unset**, same as CI does
   (`.github/workflows/qa.yml` — `email_service.py` no-ops and just logs the message
   without them). Group tests seat `QA_USERS.secondary` — an already-registered
   persona — by real email several times per run (`groups-api.spec.ts`, `balances.spec.ts`,
   `group-splits.spec.ts`); with real mail credentials configured (whatever's in the
   backend's own `.env`, not this framework's), every one of those sends a real
   "you were added to a group" email. Reproduced: this is what "the coding agent ran
   some tests and now I'm getting mail failures" actually was — not a leftover unmocked
   unit test (`varavu_selavu_app/tests/` is fully mocked; see its `conftest.py`), but this
   separate framework driving a real backend process by design, which no in-process
   Python mock can reach.
2. **Frontend** — from `varavu_selavu_ui/`:
   ```bash
   REACT_APP_API_BASE_URL=http://localhost:8080 npm start
   ```
3. **Tests** — from `qa/`:
   ```bash
   npm run qa:smoke          # fast golden path, Chromium only
   npm run qa:regression     # everything tagged @regression, Chromium
   npm run qa:regression:full  # + Firefox, WebKit, one mobile viewport
   npm run qa:api             # API-only suite
   npm run qa:mobile          # @regression on the mobile viewport project only
   npm run qa:prod-smoke      # read-only, against PROD_BASE_URL — never local
   npm run qa:all              # literally everything
   ```

## Debugging a failure

```bash
npx playwright test <file> --headed --debug     # step through interactively
npx playwright show-trace reports/test-results/<test>/trace.zip
npm run qa:report                                # open the last HTML report
```

Failed tests automatically capture a screenshot, a trace, and (CI only, `retain-on-failure`)
a video — all under `qa/reports/`.

## Real rate limits — read this before adding a test that logs in or registers

The real backend rate-limits `POST /auth/login` to **5/minute** and `POST /auth/register`
to **5/hour**, both keyed by IP — and every Playwright project/script in a run shares one
backend instance from one machine, so they share the same buckets.

- **Logins**: `auth.setup.ts` performs at most 2 real logins (primary + secondary) **per
  run**, not per `playwright test` invocation — it's guarded the same way registration is
  (see below): if a `storageState` file for the *current* run's persona already exists
  (`e2e/auth/{primary,secondary}.json`, keyed by the run's own generated email), it's
  reused instead of logging in again. This was a real bug, not a hypothetical: running
  `qa:smoke` then `qa:regression` back-to-back against the same backend (exactly what one
  CI job does) originally re-triggered `setup`'s 2 logins on *every* invocation, and
  between that and login.spec.ts's own tests, regression started getting real 429s
  ("Too many attempts") partway through — reproduced verifying this framework locally.
  Tests that specifically need a *fresh, real* login beyond what `setup` already covers
  (login.spec.ts, session.spec.ts's logout test, smoke.spec.ts, registration.spec.ts) are
  the only other place one should happen — keep it that way, and be aware they still
  share the same 5/minute bucket with each other and with `setup`'s first-ever login of a
  run, so don't add more of them without checking the math holds.
- **Registrations**: `global.setup.ts` registers the 2 QA personas **once per run**,
  guarded by a marker file (`qa/.qa-provisioned/<runId>.json`) so re-running `qa:smoke`
  then `qa:regression` then `qa:api` in the same CI job (same `GITHUB_RUN_ID`) doesn't
  re-register them. On top of that: `registration.spec.ts` (1 call) +
  `auth-api.spec.ts` (2 calls: duplicate-email, weak-password) = **5 total per CI job**,
  exactly at the limit. If you need another registration-consuming test, remove one of
  the existing ones or you will get intermittent 429s across the whole job — this was
  tuned deliberately, not accidentally low.
- **This budget is genuinely tight, not just theoretically tight.** Verifying this
  framework locally (workers=4, no retries), the login budget above was still
  occasionally exceeded when `qa:smoke` and `qa:regression` ran back-to-back — the 429
  shows up as a real "Too many attempts" error on the login page, timing out whatever
  the test was waiting for next. CI's `retries: 1` (see `playwright.config.ts`) is the
  actual safety net here, not just noise-tolerance: a 429-caused failure retries after
  the rolling 60s window has moved on and should pass the second time. If you see the
  *same* login test fail on both attempts in CI, that's a real signal, not this budget.

## Email verification — required for group tests

A freshly registered user has `email_verified=false`, and the backend's
`GroupService.require_verified_email` blocks every group action (create, join, accept an
invite, ...) on that. Normal accounts verify by clicking an emailed link; QA deliberately
runs with no real SMTP configured, so there's no HTTP-level way to complete that flow.
`global.setup.ts` works around this the same way the backend's own pytest suite does for
itself (`tests/conftest.py`'s email-verified-by-default insert listener) — by reaching
into the database directly (`qa/scripts/verify_qa_users.py`) right after registering the
two QA personas. This needs `QA_DATABASE_URL` set to the same Postgres the backend under
test is using (see `.env.example`); without it, every group test fails with a clear
`403 "Verify your email address..."` rather than this step failing outright.

## Shared QA persona — a note for new tests

Every e2e/API test in a run authenticates as the **same** `primaryApi`/primary browser
identity by default (a second `secondaryApi`/persona exists for anything that genuinely
needs a distinct counterpart — groups, invites, cross-user authorization checks). Spec
files run in parallel. This means:

- **Never assert an exact whole-account total** (e.g. `total_expenses` across everything).
  Another spec file may be creating/deleting expenses on the same account at the same
  moment. Instead: assert a **before/after delta** around your own change (see
  `dashboard.spec.ts`), or use a **uniquely-tagged category** via `taggedCategory()`
  (see `analysis-calculations.spec.ts`, `budgets-api.spec.ts`) so your assertion is
  immune to what other tests are doing concurrently.
- Every record you create should go through `qaLabel()`/the `qa*Api.create*` helpers so
  it's `QA_E2E_<runId>_`-tagged and gets swept up by cleanup.

## Adding a new test

1. Pick the right layer: **API test** (`qa/api/tests/`) if you're validating a status
   code, a calculation, or an authorization rule — don't duplicate that in the browser
   too. **E2E test** (`qa/e2e/tests/<feature>/`) if you're validating what a user
   actually sees/can do.
2. Reuse a page object from `qa/e2e/pages/` or add a focused one — locators go there,
   assertions go in the spec.
3. Tag it: `@smoke` only for the golden path, `@regression` for everything else that
   should run on every PR, `@critical` for anything that should block a release,
   `@api`/`@negative`/`@validation`/`@auth`/`@permissions` as fits.
4. Tag every record you create (`qaLabel(...)`) and clean it up (`afterEach`/`finally`/
   the API `delete*` helper) unless the whole environment is disposable (CI).
5. If it's a financial assertion, read the "shared QA persona" note above first.

## CI/CD behavior

`.github/workflows/qa.yml` runs on every PR to `main`, on push to `main`, and on manual
dispatch — **one job**, on purpose (see the rate-limit note above: splitting into
separate jobs would re-provision QA users on fresh runners and blow the register budget).

Pipeline: spin up a `postgres:15-alpine` service container → `alembic upgrade head` →
start the real backend and a production build of the frontend → `qa:smoke` (fails fast) →
`qa:regression` (Chromium; PRs get Chromium only for speed, `push`/`workflow_dispatch`
additionally run the full Firefox/WebKit/mobile-viewport matrix) → `qa:api` → upload the
HTML report, JUnit XML, traces, videos and screenshots as a build artifact, **always**,
even on failure.

The job exits non-zero on any test failure (Playwright's default), which fails the
GitHub Actions check. **To actually block merges**, turn on branch protection on `main`
requiring the `QA / Smoke, regression & API tests` check — that's a repo-settings change
this framework doesn't make for you.

`cloudbuild.yaml` (the Cloud Run deploy pipeline) is intentionally untouched — there is no
staging slot to deploy a candidate into and smoke-test before it takes prod traffic. A
true deploy-time gate (deploy with `--no-traffic`, smoke test the tagged revision,
migrate traffic only on green) is a natural next step once a GCP dev/staging environment
exists, per the plan already discussed for that work.

## Before deploying to prod

Merging to `main` here *is* the deploy trigger (`cloudbuild.yaml` builds and deploys
straight to Cloud Run on push, no staging slot, no manual gate) — so "before prod" means
before you merge:

1. **`make release-check`** (or `npm run qa:api && npm run qa:regression && npm run
   qa:smoke` — order doesn't matter locally, but this is fail-fast-cheapest-first) — the
   backend's own `pytest` suite plus the full `qa/` gate against a real local stack.
   This is the same thing `.github/workflows/qa.yml` runs on the PR; running it locally
   first just gets you a faster loop than waiting on CI.
2. For a larger/riskier change (auth, payments-adjacent, group splits, a dependency
   bump): **`make qa-regression-full`** — the same regression suite across Firefox,
   WebKit and one mobile viewport too, not just Chromium.
3. Once GitHub Actions is green on the PR (and branch protection requires it — see
   above), merge.
4. **After the deploy lands**: `make qa-prod-smoke` — confirms the live site is actually
   up and serving (read-only, safe to run any time; never run before the deploy, it'll
   just tell you about the *previous* version).

There is currently no automated gate between merge and prod traffic — step 3 is a human
judgment call based on step 1/2's results, not something this framework enforces for you.

## Known gaps (see `TEST-PLAN.md` §3 for the full list)

Receipt/OCR parse results, recurring expenses, Card Coach/Tags detail flows, entity
resolution (flag off in prod), CSV export content-diffing, Google OAuth login, and the
mobile app (React Native — not Playwright-testable) are not covered by this pass.
