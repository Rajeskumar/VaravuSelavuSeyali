# 08 — Release Readiness Checklist (reusable)

Use for every production release. It **adds QA/UAT evidence and sign-off** on top of the engineering checklist in `.ai-sdlc/checklists/release-checklist.md` (CI, audits, migrations, flags, privacy) — complete both; do not duplicate their items. The `release-readiness` skill can pre-fill the evidence table from CI.

**Release:** ______ · **Commit/tag:** ______ · **Date:** ______ · **Release manager:** ______ · **QA owner:** ______

The per-release run sheet (automated suites, the every-release manual smoke test, real-device checks) is [`11-release-test-sheet.md`](11-release-test-sheet.md); current coverage and gaps are in [`10-coverage-map.md`](10-coverage-map.md).

## 1. Entry criteria (before testing starts)
- [ ] Release candidate commit identified; `main` frozen except for release fixes.
- [ ] `unit.yml`, `qa.yml` and `framework.yml` green on the exact commit (web lint/tsc/Jest, mobile tsc/Jest, backend pytest).
- [ ] `make release-check` green (pytest + `audit-all`); Postgres-only tests run (`varavu_selavu_app/run_e2e_pg_tests.sh`).
- [ ] Migrations reviewed: random-hex id, reversible, compatible with the currently deployed code (they run **before** deploy through the `migrate-db` Cloud Run job).
- [ ] Test environment is **not production**; synthetic users only; mail disabled; flags set as production will be (`GET /api/v1/config` captured).

## 2. Required test evidence

| Evidence | Source | Required result | Link / run id | ✔ |
|---|---|---|---|---|
| Tier 1 smoke (Chromium) | `qa.yml` / `npm run qa:smoke` | 100% pass | | |
| Tier 2 regression (Chromium) | `qa.yml` / `npm run qa:regression` | 100% pass; no new skips | | |
| Cross-browser subset (Firefox, WebKit, `mobile-iphone`) | `qa.yml` (main) | 100% pass | | |
| API suite | `npm run qa:api` | 100% pass | | |
| Accessibility scan | `scripts/quality/accessibility.sh --axe` | 0 serious/critical on all routes, light + dark | | |
| Security checks | `scripts/quality/security.sh` | audits at/below allowlist; no secrets | | |
| Manual UAT (Tier 3) | `04-uat-test-cases.md` cases typed *Manual* + P0 list below | all executed; results recorded | | |
| Prod read-only smoke (post-deploy) | `npm run qa:prod-smoke` | pass | | |

## 3. P0 journeys that must be demonstrated for **every** release
Record Pass/Fail with evidence (screenshot/trace/run id). Automated where a test exists; otherwise manual.

| Journey | UAT IDs | Method | Result | Evidence |
|---|---|---|---|---|
| Sign in / out / guarded routes | UAT-AUTH-001..006 | Auto | | |
| Log expense; one row; totals reconcile | UAT-EXP-001..004 | Auto | | |
| Failure + draft recovery (no duplicate, no loss) | UAT-EXP-005..006 | Auto (once built) / Manual | | |
| Edit / delete with cancel | UAT-EXP-014..016 | Auto | | |
| Group split correctness (equal, odd cent, exact) | UAT-GRP-004..007 | Auto | | |
| Settle up to zero | UAT-GRP-008 | Manual until automated | | |
| Receipt scan → itemised save | UAT-RCPT-001..005 | Manual until automated | | |
| Data isolation (user A cannot see/modify B) | PERM-001..003, UAT-GRP-010 | Auto | | |
| Phone-width first run (consent undecided) | UAT-RESP-002 | Auto (once built) / Manual | | |
| Account: change password, export, delete (disposable) | UAT-ACC-002, 004, 005 | Manual | | |
| MCP connect/approve (only if the feature ships enabled) | UAT-MCP-001..002 | Manual | | |

## 4. Defect handling
- Every failure gets a ticket with: UAT ID, build/commit, environment, steps, expected vs actual, evidence, severity.
- Severity = `.ai-sdlc/README.md` model. **Release is blocked by any open P0.** Open P1s need a written waiver (owner, reason, due date) from the release manager and QA owner.
- Retest rule: a fix requires re-running the failing case **and** the Tier 1 smoke; P0/P1 fixes also re-run the related Tier 2 specs.
- Flaky test policy: a failure may be re-run once; a pass-on-retry is logged as flaky with a ticket — never silently accepted for P0 journeys.
- Known issues carried forward must be listed in the release notes and in `docs/qa/07-qa-gap-analysis.md`.

## 5. Mobile app (only when a mobile build ships)
- [ ] **Mobile analytics (iOS and Android, each):** consent prompt shows once at first launch (before sign-in) with both switches off; Account → Privacy toggles apply at once; a `qa` build's DebugView run shows `screen_view` once per navigation and the login, expense, receipt, group, settlement, Ask and deep-link events with no private values; test crash arrives symbolicated in the **Dev** Firebase project; a `production`-configured build was not used for any of this; production receives nothing from `qa`/test builds; store privacy disclosures match `docs/analytics/mobile.md` §9 (TS-GA4-002, AN-15).
  - Android production-configured analytics and consent-off smoke was reported complete by the owner on 2026-11-26. This is partial evidence; the non-production QA, Crashlytics, privacy and full event checks above remain open.
- [ ] Build via `make start-mobile-*` smoke on iOS and Android **devices** (simulator/emulator regression runs locally with `qa/mobile` when mobile code changed since the previous release: the release record's `native-mobile-e2e` check; real-device checks stay manual).
- [ ] Manual JM-01..JM-07 from `03-user-journeys.md` (login, add expense + recovery, receipt OCR, groups/deep link, push if enabled with `TRACKSPENSE_ENABLE_PUSH=1`).
- [ ] Store identifiers unchanged (`com.cerebroos.trackspense`); minimum iOS 17.0; Xcode ≥ 26.4.
- [ ] Web/mobile parity gaps reviewed against D-05.

## 6. Exit criteria / Go–No-Go
- [ ] All entry criteria met and all evidence in §2 attached.
- [ ] All §3 journeys Pass (or waived P1 only; **no waivers for P0**).
- [ ] No open P0; P1 waivers recorded.
- [ ] Rollback plan stated (previous image + schema compatible).
- [ ] Launch-owner items confirmed outside the repo (OAuth origins, SMTP, push config, legal).

## 7. Sign-off

| Role | Name | Decision (Go / No-Go / Go with waivers) | Date | Signature |
|---|---|---|---|---|
| QA owner | | | | |
| Engineering lead | | | | |
| Product owner | | | | |
| Release manager | | | | |

Store the completed checklist with the release notes (e.g. `docs/sdlc/releases/<version>/release.md`).

The canonical lifecycle and gate vocabulary live in `.ai-sdlc/lifecycle.md`. Use the release.json schema
with this QA evidence; a Go decision is an assessment, not automatic authorization to tag or deploy.
