# TrackSpense QA — Test Plan

This plan is derived from reading the actual repository (backend routes/models/services,
frontend routes/components, existing tests, CI/deploy config) — not from guessed product
behavior. See the exploration notes folded into this document and into `qa/README.md`.

## 1. Application under test

TrackSpense is a Splitwise-style personal + shared expense tracker.

- **Backend** — `varavu_selavu_app`: FastAPI, SQLAlchemy/Postgres (fixed `trackspense`
  schema), Poetry. ~130 routes under `/api/v1`. JWT auth via HttpOnly cookies
  (`vs_token`/`vs_refresh`) + double-submit CSRF cookie (`vs_csrf`), or `Authorization:
  Bearer` for native clients. Rate-limited (`slowapi`): `/auth/login` 5/minute,
  `/auth/register` 5/hour, per IP.
- **Web frontend** — `varavu_selavu_ui`: Create React App + MUI + react-router v6 +
  react-query. This is the QA framework's browser target.
- **Mobile** — `varavu_selavu_mobile`: React Native/Expo. **Out of scope** for this
  framework — Playwright drives browsers, not native app builds. See §8.
- **Production** — `expense.cerebroos.com` (frontend) / `trackspense-api.cerebroos.com`
  (backend), deployed via `cloudbuild.yaml` straight to Cloud Run with **no staging slot
  and no test gate today**. Live feature flags (confirmed via `GET /api/v1/config`):
  `groups_enabled=true, budgets_enabled=true, card_coach_enabled=true, tags_enabled=true,
  entity_resolution_enabled=false`.

## 2. Features discovered (feature inventory)

| Area | What exists |
|---|---|
| Auth | Register, login (cookie+CSRF), Google OAuth, logout, refresh-token rotation w/ reuse detection, forgot/reset password, email verification, profile CRUD, account deletion |
| Expenses (personal) | Create/list/update/delete, itemized (receipt-derived) create/edit, CSV export, categorize (AI), tags, card attribution |
| Dashboard | "True total" hero (personal + group shares), month-over-month delta, change insights, spend-by-category, recent feed, empty state |
| Groups | Create/list/update/archive/restore/delete, members (add/remove, email-invite or placeholder), invites, leave, settlements, group expenses (simple + itemized), balances (pairwise or simplified/netted), activity feed, per-expense comments/history, notification prefs, CSV export, AI split-assignment suggestion |
| Analysis/Reports | Category totals, monthly trend, item/merchant insights, budgets, card-coach reward-gap analysis, scope = personal/combined/groups/i_paid/group_total/group |
| Budgets | Create/edit-in-place/delete, live spent/committed/remaining/projected off the *same* AnalysisService ledger, suggestions, "ask why" (LLM) |
| Recurring | Templates, due-occurrence detection, confirm/execute-now, personal + group-linked |
| Receipts | Upload → OCR parse (mock/openai/gemini/ollama engine), MIME allow-list + magic-byte sniffing + size cap |
| Card Coach | Card catalog, held cards, default card, custom cards, reward-gap coach, corrections |
| Tags | CRUD, bulk apply/remove, per-expense association (privacy-scoped on shared group expenses) |
| Settings | Profile (name/phone/address/payment handles), theme (local-only, not server-persisted), delete account |
| Entity resolution | Merchant/item canonicalization — **flag off in prod**, out of scope this pass |

## 3. Testing scope (this implementation)

**In scope**: smoke, functional, regression, API, negative/validation, auth/session,
financial-calculation correctness, cross-browser (Chromium always; Firefox/WebKit/mobile
viewport on full regression), CI gating, artifacts.

**Deliberately out of scope this pass** (documented, not silently dropped):
- Receipt/OCR upload flows beyond upload-safety negative tests (MIME/size) — the OCR
  parse *result* itself needs `OCR_ENGINE=mock` wiring not yet built.
- Recurring expenses, Card Coach detail flows, Tags detail flows, Entity Resolution
  (flag off in prod).
- CSV export content-diffing (download exists, byte-for-byte content isn't asserted).
- Google OAuth login (no realistic way to automate a real Google IdP handshake).
- A true deploy-time smoke gate in `cloudbuild.yaml` — explicit user decision, revisit
  once a GCP dev/staging environment exists.
- Mobile app (`varavu_selavu_mobile`) — not Playwright-testable.

## 4. Testing strategy

- **Page Object Model** for the browser suite (`qa/e2e/pages/`) — selectors prefer
  `getByRole`/`getByLabel`, fall back to a handful of added `data-testid`s only where the
  UI genuinely has no accessible role (QuickCaptureSheet's numeric keypad/chips).
- **API tests** use Playwright's own `request` fixture/`APIRequestContext` (no
  axios/supertest) — `qa/api/tests/`, prioritizing business-critical endpoints
  (auth, expenses, groups/splits, budgets, analysis) over exhaustively mirroring every
  browser test at the API layer.
- **Financial calculations** are asserted against hand-computed expected values from a
  fixed dataset (`qa/e2e/test-data/deterministic-expenses.json`) and against
  `split_engine.py`'s documented largest-remainder apportionment rule — not just "a
  number rendered".
- **No arbitrary `waitForTimeout`** — Playwright auto-waiting + explicit `expect(...)`
  polling only.

## 5. Environment strategy

| Env | Target | Suites | Writes? |
|---|---|---|---|
| Local | `localhost:3000` / `localhost:8080` against a disposable local Postgres | smoke, regression, API, mobile viewport | Yes |
| CI | Same, on a GitHub Actions runner with a `postgres:15-alpine` service container, recreated every run | smoke → regression → API, sequentially, one job | Yes |
| Prod (`expense.cerebroos.com`) | Read-only smoke only (`prod-smoke` project) | smoke (`@prod-safe`) | **Never** — hard-gated by `env.assertWritesAllowed()` unless `ALLOW_PROD_WRITES=true`, which is never set in CI/default config |

A GCP dev/staging environment is planned as separate follow-up work; the framework is
entirely `BASE_URL`/`API_BASE_URL`-driven so pointing it at a staging URL later needs no
rework — just new env values.

## 6. Test-data strategy

- Two QA personas (`primary`, `secondary`) provisioned once per run via direct API calls
  (`qa.primary.<runId>@trackspense.qa` etc.), reused everywhere via Playwright
  `storageState` — never logged in per-test (see §7, rate limits).
- Every record a test creates is tagged `QA_E2E_<runId>_...` in its description/name.
- A best-effort teardown sweep (`global.teardown.ts`) deletes anything QA-tagged still
  owned by the two personas after the run. Not the primary isolation mechanism — CI
  recreates the whole database every run regardless.
- Tests that assert *exact* totals use either a dedicated, run-unique category name
  (`taggedCategory()`) or a before/after delta, specifically because the two personas are
  **shared across every test file** running in parallel — see §7.

## 7. Application defect found while building this framework

**`alembic upgrade head` cannot bootstrap a fresh database from scratch** — discovered
while building `qa/scripts/bootstrap_schema.py`, confirmed by direct reproduction. Root
cause: the earliest migration (`0f0766accf80_baseline_schema.py`, `down_revision = None`)
only contains `ALTER`/index-rename statements; it silently assumes `db/schema.sql`'s
4-table snapshot was already applied by hand (exactly as the backend README's own setup
instructions say to do, as a *separate* step from Alembic). Beyond that, several later
tables (`item_insights`, `item_price_history`, `merchant_insights`,
`merchant_aggregates`, ...) were only ever added as SQLAlchemy model definitions, with no
corresponding `CREATE TABLE` migration at all — the repo's own `run_e2e_pg_tests.sh`
already works around this exact gap by calling `Base.metadata.create_all()` instead of
running Alembic for its two Postgres e2e test files, which is the tell that this was a
known-but-undocumented gap rather than a new one.

**Expected**: `alembic upgrade head` against an empty, schema-only database produces a
fully working TrackSpense schema (this is the standard Alembic contract, and it's the
only migration command `cloudbuild.yaml`'s prod deploy pipeline runs).
**Actual**: it throws `UndefinedTable` partway through and leaves the database in a
partially-migrated state.

**Why this matters beyond QA tooling**: `cloudbuild.yaml`'s `run-migrations` step runs
bare `alembic upgrade head` against the production Postgres instance via a Cloud Run Job,
with no `schema.sql` step before it. If that database were ever recreated from scratch
(disaster recovery, a new environment, a provider migration), that deploy step would fail
the exact same way. This wasn't previously testable because nothing had run Alembic
against a truly empty database — `db/schema.sql` is applied once by hand per the README,
and every environment since has only ever needed *incremental* migrations on top of that.

QA's workaround (`qa/scripts/bootstrap_schema.py`): `Base.metadata.create_all()` for
schema (same fix the repo's own e2e script already uses) → `alembic stamp head` → replay
just the one seed-data migration (Card Catalog) directly, since it's pure `INSERT`s with
no schema dependency issue. This is a workaround for QA's own database bootstrap, **not**
a fix to the actual migration chain — that's a real gap for whoever owns
disaster-recovery/environment-provisioning to decide how to address (e.g., a documented
`schema.sql`-first bootstrap step, or an Alembic migration that actually creates the
missing tables).

### 7b. Possible accessibility defect: AddExpenseForm's Description field

Discovered verifying `expense-crud.spec.ts`/`smoke.spec.ts` end-to-end: the edit dialog's
Description field (`AddExpenseForm.tsx`, the one reached via a row's hover edit icon —
distinct from `ExpenseDetailSheet.tsx`'s own Description field, reached by tapping the
row, which does **not** have this problem) computes an accessible name of its *placeholder*
text ("e.g., Electricity bill, Grocery at Costco"), not its label ("Description"), in
Chrome/Playwright's accessibility tree — confirmed by direct DOM inspection: the `<label
for>` **is** correctly associated with the input (`input.labels` resolves it correctly),
so this isn't a broken DOM relationship, just a browser-computed accessible name that
doesn't match the visible label. The sibling Cost field in the same form doesn't have
this problem because it sets an explicit `aria-label="Cost"`, sidestepping the ambiguity
entirely.

**Expected**: a screen reader announces "Description" for this field, same as every other
labeled field in the app. **Actual**: unconfirmed without a real screen reader, but the
underlying accessible-name computation Chrome exposes to both Playwright and real
assistive tech reports the placeholder instead — worth an actual screen-reader spot-check,
not just trusting this report. **Recommended fix**: add `aria-label="Description"`
alongside the existing `label="Description"`, matching the Cost field's pattern — a
one-line, purely-additive change, not applied here since it's a product accessibility
decision outside this task's remit (this framework's own additive `data-testid` on the
same field, `expense-form-description`, sidesteps it for QA purposes without deciding the
product fix).

### 7c. Application defect: profile save fails (422) unless every payment handle is filled in

Found by `settings/profile-settings.spec.ts` doing exactly what a real user does — open
Account settings, change just the Name field, click Save — against a QA account that
(like most real accounts) has never set a Venmo/PayPal/UPI handle. **Reproduced directly
against the backend**, isolating it from anything test-framework-specific:

```
curl -X PUT .../api/v1/auth/profile -d '{"name":"x","venmo_handle":"","paypal_handle":"","upi_id":""}'
→ 422 — venmo_handle/paypal_handle/upi_id: "String should match pattern '^[A-Za-z0-9._@+-]{1,64}$'"
```

**Root cause**: `ProfilePage.tsx`'s `handleSave` always sends the current state of all
three handle fields — `venmoHandle`/`paypalHandle`/`upiId`, each initialized to `''` and
left `''` if the user never touches them — verbatim to `PUT /auth/profile`. The backend's
`PaymentHandle` type (`models/api_models.py`) is `Optional[...{1,64}...]`: `None` is
accepted, but an empty *string* is not `None` and still has to match the pattern, which
requires **at least 1 character** — so `""` is rejected, not treated as "not set."

**Impact**: any profile save (including just changing your name) fails for any account
that hasn't filled in all three payment handles — almost every account. **Expected**:
saving a profile with blank payment-handle fields succeeds, same as it did before those
fields existed. **Not fixed here**: the two most direct fixes (frontend: omit/null a
blank handle instead of sending `""`; backend: accept `""` as "unset") are both real
product-behavior changes outside this task's agreed additive-only frontend scope — see
`settings/profile-settings.spec.ts`, which is left **intentionally failing** as the
regression test for this until it's fixed.

### 7d. Application defect: a malformed expense id crashes with a 500 instead of 404

Found by `api/tests/expenses-api.spec.ts`. `ExpenseService.delete_expense` and
`update_expense` (`varavu_selavu_app/varavu_selavu_service/services/expense_service.py`)
both do:
```python
try:
    parsed_id = uuid.UUID(str(row_id))
except ValueError:
    parsed_id = row_id  # comment: "Fallback if someone passed an int ID before migrations"
```
For a genuinely malformed id (e.g. `"not-a-uuid"`, as opposed to a legacy integer id),
this falls through to querying `Expense.id == "not-a-uuid"` against a UUID-typed column —
Postgres rejects it with `invalid input syntax for type uuid`, an unhandled `DataError`
that FastAPI doesn't catch, surfacing as a bare `500` instead of the `404`/`422` a
malformed client-supplied id should get. **Reproduced directly**: `DELETE
/api/v1/expenses/not-a-uuid` → `500`. The identical pattern in `update_expense` means
`PUT` almost certainly has the same issue (not independently re-verified, but the code is
the same). Low severity (a well-behaved client never sends a non-UUID id; this is
input-hardening, not a functional break) but a real gap — a 500 can leak more than a
clean 404 should, and it's cheap to fix (catch `ValueError` all the way through to a 404,
matching how the itemized-expense endpoints already do it via `_get_owned_personal_expense`).
Left as an intentionally-failing regression test rather than fixed here.

### 7e. Minor UI defect: duplicate "Add Expense" controls on `/expenses` at mobile width

Found verifying the `mobile-iphone` Playwright project — `getByRole('button', {name:
'Add Expense'})` resolved to 2 elements on `/expenses` at a 375-390px viewport. Confirmed
via direct DOM inspection (not a test artifact): at that width, `/expenses` renders
**both** the desktop-style header text button (`display:flex`, fully visible,
`108×44px`) **and** a separate floating "+" FAB (`aria-label="Add Expense"`,
`56×56px`) at the same time — two controls that do the identical thing, stacked on top
of each other. `/dashboard`, by contrast, correctly shows only the FAB at the same
viewport width — so this is specifically an `ExpensesPage`-level inconsistency, not a
global pattern. Low severity (doesn't block any action, just visual redundancy/clutter),
not fixed here (a frontend layout change outside the agreed additive-only scope) — the
QA framework's own `ExpensesPage.addExpenseButton` locator works around it
(`.last()`, matching DOM order) rather than treating it as a test bug.

## 8. Risk areas

- **Real rate limits.** `/auth/login` = 5/minute, `/auth/register` = 5/hour, both per IP,
  both shared across every Playwright project/script in a run since they all hit the same
  backend from the same machine. The framework is designed around a specific, documented
  budget (see `qa/README.md`) — adding more real-login/real-register tests without
  reading that section first will cause intermittent 429s.
- **Shared account, parallel tests.** `primaryApi`/the `chromium` project's default
  identity is the same QA user across every spec file, running in parallel. Tests that
  need an exact whole-account total either isolate via a uniquely-tagged category or
  measure a delta rather than an absolute value.
- **Feature flags.** `GROUPS_ENABLED` defaults **off** in the backend's own `Settings()`
  — group tests self-skip (`test.skip` on `GET /api/v1/config`) if the environment under
  test doesn't have it on, rather than failing loudly for an environment reason.
- **`AnalysisService`'s 60s in-process cache** is invalidated on every write endpoint, so
  this shouldn't cause staleness in practice, but a slow test runner combined with cache
  TTL edge cases is a plausible source of a rare flake — noted here in case it surfaces.
- **CSRF double-submit.** Every state-changing API call must carry `X-CSRF-Token` sourced
  from the `vs_csrf` cookie — `AuthedApi` handles this automatically; a hand-rolled
  `request.post(...)` bypassing `AuthedApi` will get a 403, which is in fact exactly what
  `session.spec.ts`/`auth-api.spec.ts` use to prove the protection works.

## 9. Smoke suite

`qa/e2e/tests/smoke/smoke.spec.ts` (`@smoke @critical`) — the golden path: load → real
login → dashboard loads → create an expense → verify it appears → dashboard total
reflects it → edit it → verify the change → delete it → verify it's gone → log out.
Target: a few minutes, Chromium only. `prod-readonly.spec.ts` (`@smoke @prod-safe`) is a
second, always-read-only smoke check against the real production URL.

Run: `npm run qa:smoke` (local/CI) or `npm run qa:prod-smoke` (prod, read-only).

## 10. Regression suite

Everything tagged `@regression` across `qa/e2e/tests/**` plus the full `qa/api/tests/**`
suite: auth (login/registration/session/CSRF), dashboard, expense CRUD/validation/search,
groups/splits/balances, profile settings, permissions/authorization, and the migrated
responsive/mobile-rendering + token-storage regression suite (originally
`varavu_selavu_ui/e2e/`, absorbed here — see `qa/README.md`).

Run: `npm run qa:regression` (Chromium) / `npm run qa:regression:full` (+ Firefox, WebKit,
one mobile viewport) / `npm run qa:api`.
