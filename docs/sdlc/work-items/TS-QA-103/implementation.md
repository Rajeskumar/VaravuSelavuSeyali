# Implementation plan

Status: approved (plan Rev 2). Requirements: requirements.md; AC text: work-item.json. Test spec: test-plan.md.
Detailed design (sections 1-10) is in the approved plan; this file records the build order and contracts.

## Architecture and contracts
- App: `src/core/api/baseUrl.ts` gains an explicit e2e variant (`EXPO_PUBLIC_APP_VARIANT=e2e`) that enables the API-URL override in non-dev builds. Test-only cleartext/ATS-localhost exceptions come only from a config plugin active when `APP_VARIANT=e2e`. Route names, deep links, SecureStore keys, bundle IDs unchanged.
- Selectors: `testID` `<screen>.<element>`, added only where flows interact; `FieldBox` already forwards `testID`.
- Suite: `qa/mobile/` (Maestro flows, subflows, build/run/seed/fault-proxy scripts, README/AGENTS).
- Backend: `qa/mobile/scripts/start-test-backend.sh` exports all sensitive/outbound settings explicitly (the app reads `.env` via `load_dotenv()` and pydantic `env_file`), refuses non-local / non-`trackspense_e2e_*` DB, uses a per-run disposable DB. Existing `qa/scripts/bootstrap-local-db.sh` and `qa.yml` untouched.
- CI: `.github/workflows/mobile-e2e.yml` (changes -> android + ios -> `Native mobile gate`, `if: always()`), DORMANT since 2026-11-25: manual dispatch only; the gate step runs with pipefail so a FAIL verdict fails the job.
- Release: `scripts/quality/release_tools.py prepare` adds a `native-mobile-e2e` check when mobile-affecting files (MOBILE_AFFECTING_* in `mobile_e2e_gate.py`) changed since the previous release tag; it stays open until local regression reports for both platforms are recorded. `release-gate.py` keeps its CI job check off (`ENFORCE_MOBILE_E2E = False`).

## Risks and safeguards
Trust boundaries: a test-variant app must never reach a production build or point at a non-local backend (AC-001); the test backend must never touch a real DB, mail, AI or `.env` secrets (AC-002). Abuse/failure: smoke-only or one-platform runs must not satisfy the release gate (AC-007); a skipped/cancelled native job must fail the gate (AC-006). Financial-write flows are never auto-rerun against mutated state; lost-response scenario uses fault injection after backend commit (AC-005). Auth rate limit (5 logins/min) kept; partitions respect it. Privacy: synthetic users only; no production data. Migrations: none. Performance: PR smoke target <= 25 min, measured in Phase 2.

## Ordered tasks
- [ ] T1: Spike. Local iOS-sim e2e-variant Release build + evidence file, isolated backend launcher, one login flow; confirm macos-26 Xcode and Android Release build in a throwaway dispatch run; write ADR in docs/sdlc. Verification: ios-smoke-local.
- [ ] T2: baseUrl e2e variant + e2e config plugin + production guards + Jest tests (mobile). Verification: mobile-unit-tests, safety-negatives.
- [ ] T3: testIDs on login, tabs, add-expense, groups, receipt screens; AGENTS.md rule (mobile). Verification: mobile-unit-tests.
- [ ] T4: qa/mobile skeleton, build-ios/android with evidence + hash check, start-test-backend.sh, seed.py, run.sh, Make targets. Verification: safety-negatives.
- [ ] T5: Smoke flows (login+relaunch, expense creation, draft recovery, tab render, group expense) with isolation rules. Verification: ios-smoke-local, android-smoke-local.
- [ ] T6: mobile-e2e.yml with changes job, ios/android jobs, Native mobile gate, artifacts (dormant; manual dispatch). Verification: framework-tests (the gate step is executed with GitHub's shell semantics).
- [ ] T7: Regression flows: fault-proxy (lost response, OCR evidence), account switch, deep link, keyboard/back, delete account, dark/small screen.
- [ ] T8: release-gate.py job-level check + unit tests; routing.py, verification.py, test_integrity.py, ruleset JSON (not activated). Verification: release-gate-tests.
- [ ] T9: Docs and standards (testing.md, verification.md, DoD, docs/qa/05/06/08, ARCHITECTURE, INFRASTRUCTURE, AGENTS files, ROADMAP, FEATURE_STATUS, CHANGELOG, stale-line fixes). B-19 marked done only with CI evidence.

## Verification and documentation
required_evidence in work-item.json; scenarios in test-plan.md. Docs planned -> implemented -> released.

## Rollout and recovery
Local, release-time only (owner, 2026-11-25): the CI workflow is dormant (manual dispatch); re-enabling it means adding its triggers back (and, for iOS, a longer timeout or build caching). Recovery: delete/disable the workflow and Make targets; app change is inert unless the e2e variant env is set; no data or migration impact.
