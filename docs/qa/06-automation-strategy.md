# 06 — Automation Strategy (proposal — nothing implemented in this audit)

## 1. Starting point: Playwright already exists

`qa/` is a working Playwright + TypeScript framework (Page Object Model, API client helpers, per-run QA personas, deterministic datasets, tagged cleanup, `qa.yml`). **Recommendation: extend it; do not introduce a second framework for web.** Reuse: `qa/e2e/pages/*`, `fixtures/` (`primaryApi`, `secondaryApi`), `helpers/api.helper.ts`, `test-data/deterministic-expenses.json`, projects `setup|api|chromium|firefox|webkit|mobile-iphone|prod-smoke`, tags `@smoke` / `@regression`.

Hard constraints to design around (from `AGENTS.md`, `qa/README.md`):
- Auth is rate-limited per backend process: **5 logins/min, 5 registrations/hour**. The existing suite spends the budget exactly → new specs must use **storageState from the `setup` project or API-created data**, never add UI logins/registrations (stub them with `page.route`).
- Restart the backend between local `release-check-full` runs.
- Mail must stay disabled (`MAIL_USERNAME=`/`MAIL_PASSWORD=` blank) so group tests never send real email.
- `prod-smoke` is read-only; no state-changing test may point at production.

## 2. Three tiers

| Tier | Purpose | Contents | Trigger | Budget |
|---|---|---|---|---|
| **1 — PR smoke** | Fast confidence on critical journeys | Existing `@smoke` + new: UAT-EXP-004 (double-click), UAT-EXP-005 (failure guard), UAT-RESP-002 (banner reachability at 390px), UAT-NAV-001. Chromium only. Path-aware (UI changes run UI smoke; backend-only changes run API smoke) | every PR (`qa.yml`) | ≤ 5 min |
| **2 — Pre-release regression** | Every P0/P1 journey incl. negative/recovery | Existing `@regression` + backlog below (B-01…B-18). Chromium full; Firefox + WebKit + `mobile-iphone` on a **tagged subset** (`@cross-browser`: auth, add expense, groups split, responsive) | push to `main`, nightly, release-tag gate (`pre-push.sh` already requires green QA) | ≤ 25 min |
| **3 — Manual UAT / exploratory** | Judgment, visuals, screen-reader, device-only | UAT cases typed *Manual* in `04`; VoiceOver/NVDA pass on login, add expense, Ask; receipt scan with real photos; mobile device journeys; charts readability | before a production release | 1–2 h per release |

## 3. Technical recommendations

**Locators:** prefer `getByRole`/`getByLabel` (the app now exposes accessible names: `Save expense`, `Amount`, `Close`, row buttons labelled "<merchant>, <amount>"); keep the few stable `data-testid`s (`expense-row`, `quick-capture-save`, `true-total-hero-amount`, `file-input`). Avoid CSS-class and case-sensitive text matches (see fragile list in `05`). Add `data-testid` only where no role/name exists (chart containers, Sankey toggle).

**Fixtures:** (a) `authedPage` using the `setup` project's storageState; (b) `seededLedger` calling `api.createExpense` with the deterministic dataset; (c) `groupWithMember` (creates group + **name-only** member, because unverified emails can't be seated); (d) `consentDecided` / `consentUndecided` to run phone tests both ways (needed by UAT-RESP-002); (e) `aiStub` that routes `/analysis/chat` to a canned response (AI off in CI); (f) `ocrMock` using `OCR_ENGINE=mock` plus a fixture image; (g) `networkFail(page, pattern)` for abort/timeout/500 injection (used successfully during this audit with `page.route`).

**Auth:** one UI login in `setup` per persona (existing); API login for fixtures; for session-expiry tests stub `/auth/refresh` rather than waiting.

**Isolation & data:** every record tagged `QA_E2E_<runId>_`; run-scoped users; cleanup in `globalTeardown`; disposable user per destructive test (delete-account, sign-out-all) created through the API once per run (registration budget: reuse a pool of 2 spare personas created in `setup`).

**Determinism:** freeze or compute dates relative to today via helpers (`todayMDY`); assert on observable text/roles, never on `waitForTimeout`; wait for specific network responses (`waitForResponse`) for saves; use `expect.poll` for eventually-consistent aggregates (insights are written by background tasks).

**Evidence:** use `trace: on-first-retry`, `screenshot: only-on-failure`, `video: retain-on-failure`; upload `qa/reports` as a CI artifact; add an **axe step** (`scripts/quality/axe-scan.mjs` exists) as a separate non-blocking job first, then blocking for serious/critical.

**Parallelism:** `workers` ≥ 2 for `api` and read-only UI specs; serial for specs that mutate shared group state; shard Tier 2 across 2–3 jobs only if > 25 min.

**Accessibility in CI:** run `scripts/quality/accessibility.sh --axe` against the built app for public + storageState routes, light and dark.

**Mobile (native):** no device E2E exists. Recommend **Maestro** (YAML flows, runs on iOS simulator/Android emulator, no app instrumentation) for 5 smoke flows — login, add expense, draft recovery, group view, receipt scan with a sample image — nightly rather than per-PR (Expo dev-client build cost). Keep Jest for logic. Decide Detox vs Maestro in a spike; do not start until web backlog items B-01..B-08 are done.

## 4. Risk-based browser / viewport matrix

| Journey group | Chromium desktop | Chromium 390 (mobile-iphone) | WebKit | Firefox | Notes |
|---|---|---|---|---|---|
| Auth (login/logout/guard) | PR | Nightly | Nightly | Nightly | cookie/CSRF differences are the risk |
| Add expense + draft/failure | PR | PR (phone sheet + keypad) | Nightly | Weekly | Safari date input and `beforeunload` behave differently |
| Edit/delete/search/export | PR | Nightly | Weekly | Weekly | file download handling differs |
| Groups, splits, settle up | Regression | Regression | Nightly | Weekly | dialog sizing on phones |
| Analysis charts (Plotly) | Regression | Regression (overflow) | Weekly | Weekly | canvas/SVG rendering |
| Receipt upload | Regression | Regression | **Nightly** (file picker/camera attrs) | Weekly | mock OCR |
| Responsive/overflow/targets | — | PR | Nightly | — | include 320 and 768 widths |
| Accessibility (axe) | Nightly | — | — | — | light + dark |

"PR" = Tier 1, "Regression" = Tier 2 on main/nightly, "Nightly/Weekly" = scheduled run of `@cross-browser`.

## 5. CI integration (proposal)

- Keep `qa.yml` as-is for gating; add `schedule:` (nightly) running Tier 2 + cross-browser subset + axe; add path filters so docs-only changes skip.
- Add a job that runs **Postgres-only backend tests** (`run_e2e_pg_tests.sh`) — currently outside CI.
- Publish Playwright HTML report + traces as artifacts; fail the job on any `@smoke` failure.
- Release gate: `release-readiness` skill / `docs/qa/08` checklist consumes the green Tier 2 run for the release commit.

## 6. Implementation backlog (proposed, prioritised — awaiting approval)

| # | Item | Level | Pri | Effort | Related UAT |
|---|---|---|---|---|---|
| B-01 | Phone: banner must not block FAB/bottom nav (fix **and** regression test with consent undecided) | defect + E2E | P0 | S | UAT-RESP-002 — **Done 2026-11-22** (`regression/consent-banner-phone.spec.ts`) |
| B-02 | Quick Capture duplicate-click guard test | E2E | P0 | S | UAT-EXP-004 — **Done** (`expenses/quick-capture-recovery.spec.ts`, desktop) |
| B-03 | Network-failure → unknown-outcome guard (route abort/500/timeout) | E2E | P0 | M | UAT-EXP-005 — **Done** (connection reset case; 500/timeout variants not added) |
| B-04 | Draft restore/discard + beforeunload handling | E2E | P0 | M | UAT-EXP-006/007 — **Done** (same spec) |
| B-05 | Login return-path after redirect; refresh transient vs dead session | E2E (stub) | P0 | S | UAT-AUTH-005/013 — **Done** (`auth/session-guards.spec.ts`): guards redirect signed-out users; refresh 503 keeps the session, 401 returns to login (stubbed). **Return-to-page after login is not a feature** (the app lands on /dashboard; only invites and assistant approvals resume) — see ROADMAP |
| B-06 | Settle-up end-to-end (suggested + custom, balances to zero) | E2E | P0 | M | UAT-GRP-008/009 — **Done** for suggested, partial and over-payment (`groups/settle-up.spec.ts`); custom from/to form not covered |
| B-07 | Receipt scan UI with `OCR_ENGINE=mock` fixture; unsupported/oversize; items editing | E2E | P0 | M | UAT-RCPT-001..006 — **Done 2026-11-22** (`expenses/receipt-scan.spec.ts`, desktop: scan → fill → itemized save; mismatch warning blocks Save; non-image; fake PNG; >12 MB). Not covered: PDF, HEIC, daily scan limit, group split of items |
| B-08 | Recurring: create, due-prompt confirm/dismiss, run-now idempotency | E2E | P1 | M | UAT-REC-001..005 — **Done** (`expenses/recurring.spec.ts`: list + run now, run twice warns, paused/resume, delete confirm, due prompt dismiss then confirm-all). Templates are created through the API, so the Add-recurring form itself is not covered; group templates not covered |
| B-09 | Expenses filters (month/tag/scope), select-mode bulk tag, CSV for filter | E2E | P1 | M | UAT-EXP-013/017/018 — **Done** (`expenses/filters-export.spec.ts`): month filter, month CSV with formula neutralising, bulk tag/untag. Tag filter dropdown and scope tabs not covered |
| B-10 | Analysis UI totals = Dashboard; period/scope switching | E2E + FE | P1 | M | UAT-ANL-001..004 — **Done** (`analysis/analysis-budgets-cards.spec.ts`): Analysis total = Dashboard total, category row drill-down, Year ≥ Month. Group-share toggle, items/merchants tabs not covered |
| B-11 | Budgets & Cards UI (create/delete/pace; add/default/remove) | FE + E2E | P1/P2 | M | UAT-BUD/CARD — **Done** (same file): overall budget create/validate/delete, catalog card add/remove. Category budgets, pace display, set-default not covered |
| B-12 | Invite accept flow (logged-out → login → accept) | E2E | P1 | M | UAT-GRP-012 — **Done** (`groups/invite-accept.spec.ts`): signed-out prompt + remembered token, signed-in accept lands on the group, unknown link. The log-in-then-resume step is not automated (no spare logins) |
| B-13 | Account: change password, sessions, export; delete-account with disposable user | E2E | P0/P1 | L | UAT-ACC-002..005 — **Done** (`account/account-security.spec.ts`, tagged `@account` and run in its own CI step because it needs two real logins): change password (mismatch, success), session list, CSV + JSON export, delete account (cancel, confirm, credentials stop working) on a disposable user `QA_DISPOSABLE_USER`. Sign-out-everywhere and profile edit not covered here |
| B-14 | Forgot/reset/verify-email UI states (stubbed email) | E2E | P1 | S | UAT-AUTH-010..012 — **Done** (same file as B-05): forgot password uniform answer, reset page with no/bad token, mismatched passwords, invalid verification link |
| B-15 | Ask AI with stubbed provider (consent, answer, quota, off-topic) | E2E | P1 | M | UAT-ASK-001..004 — **Done** (`ask/ask-stubbed.spec.ts`, usage and chat stubbed): consent declined sends nothing, answer shown, daily-limit message, no questions left, AI off |
| B-16 | MCP connect/approve browser flow with scripted client | E2E | P0 | L | UAT-MCP-001/002 — **Partly done** (`assistants/assistants-stubbed.spec.ts` with stubbed `/mcp` endpoints; MCP-off 404 test in `session-guards.spec.ts`). A real OAuth round trip with a scripted MCP client against `MCP_ENABLED=true` is **not** automated |
| B-17 | axe job in CI (non-blocking → blocking) + keyboard-only journey | CI + E2E | P1 | S | UAT-A11Y-001, RESP-003 — **axe step added to `qa.yml` (blocking on serious/critical; 22 routes clean locally)**; keyboard-only journey not done |
| B-18 | Add Postgres-only backend tests to CI; refresh `qa/TEST-CASES.md` drift | CI/doc | P1 | S | — — **Done**: `backend-postgres` job added to `unit.yml` (analytics, groups, concurrent AI-quota PG tests, one pytest process per file). Found and fixed a stale test (groups PG test lacked a verified user). `qa/TEST-CASES.md` 403→404 drift fixed earlier |
| B-19 | Mobile smoke via Maestro (spike) | device E2E | P2 | L | JM-01..07 — **In progress (TS-QA-103, 2026-11-23)**: Maestro suite in `qa/mobile/` (see `docs/decisions/0001-native-mobile-e2e-maestro.md`). **13 flows run green locally on both platforms** (iOS 27 simulator; arm64 Android 15 emulator; shuffled, first attempt): login + relaunch, expense creation, draft recovery, tab render, group expense, and the AC-005 regression flows (lost save response, account switch, receipt OCR, deep links, sheet accessibility). **Not yet done:** the first CI runs of `mobile-e2e.yml`, Android receipt-OCR parse quality (F-015), keyboard/back, delete account and dark/small-screen flows, and promotion to a required check. Mark Done only with green CI links on both platforms |

Status 2026-11-22: every backlog item except B-19 is implemented (B-16 partly): 60+ new browser tests plus the Postgres CI job. Chromium regression run locally: 105 passed, 0 failed, 17 skipped by design; phone project: 25 passed, 18 skipped. Not run in GitHub Actions yet. Notes: tests that must not change shared state use `QA_DISPOSABLE_USER` (provisioned in `global.setup.ts`); the Recurring spec is serial and never leaves a *due* template (the load-time prompt would cover other tests); prefer `exact: true` and email-based member lookup.

Order of execution: B-01 → B-02..B-05 → B-06/B-07 → B-12/B-13/B-16 → rest. Estimated total: ~3–4 engineer-weeks for B-01..B-18 (rough; excludes B-19).

## 7. Explicitly out of scope / not recommended
Rewriting existing reliable specs; visual-regression screenshots of data-heavy charts (high flake, low signal) beyond the existing Home tour screenshots; per-browser repetition of the full suite; production writes of any kind.
