# 05 — Test Coverage Matrix

What is *validated by an existing automated test* vs. what is only *specified* (`04-uat-test-cases.md`). "Existing" names files found in the repo on 2026-11-22; test bodies were not re-run in this audit (CI status was not queried). **Coverage here means "a test exists that asserts the behaviour", not that it passes today, and not that the behaviour is correct.**

## 0. Update 2026-11-22 — after the automation backlog

The tables below describe the repository **at audit time** and are kept for the record. Since then:

| Measure | At audit | Now |
|---|---|---|
| Browser E2E specs / tests | 16 / 63 | 28 / 110 |
| Web Jest files | 43 | 47 |
| Mobile Jest files | 33 | 34 |
| Backend test files | 86 | 88 (new: date window, migration check) |
| UAT scenarios with a direct automated test | 43 "direct" (heuristic) | **49 automated** + **24 partly automated** + 8 not automated (of 81; see `04` status line) |
| Accessibility scan in CI | no | yes (`qa.yml`, 22 routes × light/dark) |
| Postgres-only backend tests in CI | MCP only | MCP + analytics + groups + AI-quota concurrency |

Status words in `04` are "automated, passing locally" (Chromium; Firefox, WebKit and the phone project for most specs), not "passed in CI": the first GitHub Actions run of the new specs is still outstanding.

Journeys that moved from ❌/🟡 to ✅ at UI level: J-04 Quick Capture write protection, J-05 receipt scan, J-08 recurring, J-10 settle-up (suggested/partial/over-payment), J-11 invite accept (signed-in), J-12 Analysis totals, J-13 budgets and J-14 cards (basic), J-15 Ask (stubbed), J-16 account security, J-17 export and delete-account, J-18 assistant pages (stubbed), J-19 phone banner and accessibility scan. Still thin: mobile native (no device tests), real OAuth/MCP, real AI/OCR, email, push, screen readers.

## 1. Test assets found

| Layer | Location | Size | Runs in |
|---|---|---|---|
| Backend unit/API (pytest, SQLite) | `varavu_selavu_app/tests/test_*.py` | 86 files (auth, expenses, groups, balances, settlements, budgets, cards, tags, receipts, chat, AI quota, MCP/OAuth, security, export, deletion…) | `make test-backend`, `unit.yml`, pre-commit/pre-push |
| Backend Postgres-only | `tests/*_e2e_pg.py` (+ `mcp_pg`, `mcp_migrations_pg`) | 5 files | `unit.yml` jobs `mcp-postgres` and `backend-postgres` (added 2026-11-22), `run_e2e_pg_tests.sh` |
| Web unit/component (Jest + RTL) | `varavu_selavu_ui/src/**/*.test.*` | 43 files | `make test-web`, `unit.yml` |
| Mobile (Jest) | `varavu_selavu_mobile/src/**/*.test.*` | 33 files (utils, core, ItemSplitBoard, PayerPicker, Profile, AddExpense recovery, boundary) | `make test-mobile`, `unit.yml` |
| Browser E2E (Playwright) | `qa/e2e/tests/**` | 28 spec files, 110 `test()` blocks (2026-11-22; was 16 / 63 at audit time) (auth 4 files, dashboard, expenses 3, groups 2, permissions, regression 2, settings, smoke 2) | `qa.yml` (PR: smoke + regression on Chromium; main: + Firefox, WebKit, `mobile-iphone`) |
| API E2E (Playwright `request`) | `qa/api/tests/**` | 7 specs, 52 `test()` blocks | `qa.yml` |
| QA inventory | `qa/TEST-CASES.md`, `TEST-PLAN.md` | 96 IDs (SMOKE/AUTH/DASH/EXP/CALC/GRP/BUD/SET/PERM/NEG/REG) | doc only |
| Accessibility | `scripts/quality/axe-scan.mjs`, `accessibility.sh` | 11 routes × light/dark | `qa.yml` step (added 2026-11-22) + local |
| Security | `make audit-all`, `scripts/quality/security.sh`, `qa/api/tests/security-api.spec.ts` | audits + 7 API tests | pre-push (`release-check`), local |

Playwright projects: `setup`, `api`, `chromium`, `firefox`, `webkit`, `mobile-iphone`, `prod-smoke` (read-only). Real auth rate limits apply (5 logins/min, 5 registrations/hour) — suite budget is fully spent (see `06`).

## 2. Journey → coverage

Legend: **E2E** Playwright UI · **API** Playwright request · **BE** pytest · **FE** Jest/RTL · **M** mobile Jest. ✅ asserted · 🟡 partial · ❌ none.

| Journey | Existing tests (examples) | UI E2E | API/BE | Component/unit | Missing coverage | Recommended level |
|---|---|---|---|---|---|---|
| J-01 Register | qa AUTH-007 (`registration.spec.ts`, chromium only), AUTH-016/017 (API), REG-024 (stubbed per-field validation); FE `RegisterPage.test`; BE `test_auth`, `test_email_verification` | 🟡 | ✅ | ✅ | Verify-email UI states, Google sign-up, unverified-user limits | E2E (1 reg/run) + FE |
| J-02 Sign in/out/session | qa AUTH-001..006, 008, 009, 010..015, PERM-001; FE `api/request.test`, `api.test`, `csrf.test`; BE `test_auth_cookies`, `security_hardening` | ✅ | ✅ | ✅ | Return-path after login; refresh transient-failure UI; token-revocation after sign-out-all (E2E) | E2E (stub) |
| J-03 Log simple expense | qa SMOKE-001, EXP-001, DASH-002, EXP-004..008; BE `test_expenses_api`, `amount_validation`; FE `AddExpenseForm.test`, `QuickCaptureSheet.mobile.test` | ✅ | ✅ | ✅ | Double-click duplicate guard, category suggestion/override, back-dated date, More-options fields | E2E |
| J-04 Recovery/draft | M `AddExpenseScreen.recovery.test`, `expenseDraft.test` (mobile); FE `utils/expenseDraft.test` (logic only) | ❌ | — | 🟡 | **Web UI**: unknown-outcome guard, restore/discard, beforeunload | E2E (route stub) |
| J-05 Receipt scan | BE `test_receipt_ingestion`, `receipt_ocr_routes`, `receipt_ocr_recovery`, `receipt_text_parser`; qa NEG-005..007 (API); FE `useReceiptScan.test`; M `onDeviceOcr.test`, `receiptSplit.test` | ❌ | ✅ | 🟡 | End-to-end UI scan→items→save; items≠total behaviour; consent variants | E2E with `OCR_ENGINE=mock` + fixture image |
| J-06 Edit/delete | qa EXP-001/002/003/013..017; FE `ExpensesPage.test` | ✅ | ✅ | ✅ | Move-to-group; edit validation errors in sheet | FE + E2E |
| J-07 Search/filter/export | qa EXP-009..012, EXP-014 (API); BE export tests | 🟡 (search only) | ✅ | 🟡 | Month/tag/scope filters, select-mode bulk tag, CSV content for filter, infinite scroll | FE + 1 E2E |
| J-08 Recurring | BE recurring tests (`recurring_groups`…); FE `RecurringPrompt` (none) | ❌ | 🟡 | ❌ | Template CRUD UI, due prompt confirm/dismiss, run-now idempotency | FE + E2E |
| J-09 Group + shared expense | qa GRP-001..008, CALC-004..006; FE `SplitEditor`, `PayerPicker`, `ItemSplitBoard`, `GroupsPage.test`, `GroupsPage.lifecycle.test`, `GroupSettingsDialog.test`; BE `groups_*`, `balances`, `split_engine` | ✅ | ✅ | ✅ | Add-member by name/email UI; group settings flows E2E; itemised group expense | E2E (rate-limit aware) |
| J-10 Settle up | FE `SettleUpDialog.test`; BE `settlements_api`, `settle_by_expense`; qa **none** | ❌ | ✅ | ✅ | UI settle end-to-end; custom settlement validation | E2E |
| J-11 Join via invite | BE `group_invite_seat_takeover`, `groups_api`; qa **none** | ❌ | ✅ | ❌ | Logged-out → login → accept UI; invalid token | E2E |
| J-12 Analysis | qa CALC-001..003 (API); FE `ItemsTab.test`, `MerchantsTab.test`; BE analysis/insights tests | ❌ | ✅ | 🟡 | UI totals vs Dashboard; period/scope switching; category drawer | FE + E2E |
| J-13 Budgets | qa BUD-001..004, CALC-007 (API); BE `budgets_api` | ❌ | ✅ | ❌ | Budgets tab UI (create/delete/pace/ask-why) | FE + E2E |
| J-14 Card Coach | BE card tests; FE `CardsTab.estimate.test` | ❌ | ✅ | 🟡 | Add/default/remove UI | FE |
| J-15 Ask AI | FE `AIAnalystChat.recovery.test`, `AskOverlay.test`, `aiConsent.test`; BE `test_chat_*`, `ai_quota` | ❌ | ✅ | ✅ | UI answer/quota/off-topic with stub provider; consent gate E2E | E2E (stub LLM) |
| J-16 Password/sessions/reset | FE `SecuritySection.test`; BE `test_auth`, `security_hardening`, `email_verification`; qa SET-001..003 (profile) | ❌ | ✅ | ✅ | Forgot/reset UI, change-password E2E | FE + E2E |
| J-17 Export/delete account | BE `account_deletion`, `personal_export`; qa **none** | ❌ | ✅ | ❌ | UI export download, delete flow (disposable user) | E2E (disposable) |
| J-18 MCP assistants | FE `AssistantAccessPage.test`; BE `test_mcp`, `mcp_oauth`, `mcp_pg`, `mcp_migrations_pg` | ❌ | ✅ | ✅ | Browser consent/approve E2E with a scripted client | E2E |
| J-19 Responsive/mobile web | qa REG-001..005, 020..023 (`responsive-mobile`, `mobile-usability`, 23 tests) | ✅ | — | ✅ | Run **before consent answered** (F-01); 320px; tablet; landscape | E2E |
| Mobile JM-01..07 | M Jest (utils, core, selected components); **native iOS Simulator E2E (Maestro, `qa/mobile`, TS-QA-103, 2026-11-23, local run only): JM-01 login + relaunch, JM-02 add expense + draft recovery, JM-04 group expense, JM-06 tab render**; no Android run and no CI run yet | 🟡 | — | 🟡 | CI runs on both platforms; JM-03 on-device OCR; JM-04 deep link; JM-05 push (manual by design); JM-07 profile/delete account; regression flows | Maestro (see 06, `docs/decisions/0001`) |

## 3. Feature-level view (UAT IDs ↔ existing tests; approximate, hand-summarised)

| Feature | UAT IDs | Existing automated coverage | Gap summary |
|---|---|---|---|
| AUTH | UAT-AUTH-001..013 | 11 of 13 have an existing test; AUTH-010/011 none | Reset/forgot UI, verify UI |
| QC / EXP | UAT-EXP-001..019 | EXP-001,002,003,012,014,015,016 covered; 004–011, 013, 017–019 partial/none | Duplicate guard, recovery, categories, filters |
| RCPT | UAT-RCPT-001..006 | API/BE only | No UI E2E |
| REC | UAT-REC-001..005 | BE partial | No UI tests |
| GRP | UAT-GRP-001..013 | 001,002(API),004..006,010 covered; 008 FE only; 011–013 FE only | Settle E2E; invite E2E |
| ANL/BUD/CARD | UAT-ANL/BUD/CARD | API strong, UI thin | UI journeys |
| ASK | UAT-ASK-001..004 | BE + FE logic | No E2E |
| ACC/SEC/MCP | UAT-ACC/MCP | BE strong; FE partial | No E2E |
| NAV/RESP/A11Y | UAT-NAV/RESP/A11Y | RESP strong; A11Y none in CI | axe not in CI; no SR pass |

Counts: of **81** UAT scenarios — **43** list an existing test that asserts the behaviour directly, **21** are only partly covered (API/component/logic level, or UI missing), **17** have none (heuristic classification of the "Existing coverage" column in `04`; indicative, not a metric).

## 4. Observations on existing tests

**Strengths:** financial-calculation tests are deterministic and exact (`CALC-*`); authorization and negative API tests are broad; data-isolation (`PERM-002`) and 404-not-403 group probing are asserted; responsive tests cover overflow and 44px targets; prod smoke is strictly read-only.

**Fragile / maintenance risks**
1. **Locator drift:** recent commits (`fef8bf0 update two regression tests to the current UI`, `eb5cd6d match the desktop "New expense" button`) show UI text/role changes breaking tests; several locators are text-based (e.g. `getByRole('button', { name: 'close' })` in `mobile-usability.spec.ts:71`, which only matches the renamed "Close" because Playwright's name match is case-insensitive substring).
2. **Rate-limit coupling:** logins/registrations are a fixed budget per backend process; any additional UI login in a spec can starve later specs (documented in `qa/README.md`).
3. **Test-inventory drift:** `qa/TEST-CASES.md` rows GRP-008 and NEG-004 still say "403" while the specs assert 404.
4. **Consent state:** responsive tests don't exercise the cookie banner, which is why F-01 (banner covering bottom nav/FAB on phones) is invisible to them.
5. **Postgres-only tests** (`*_pg`) are not part of `unit.yml`; they only run via a script, so SQL regressions can slip.

**Duplication worth keeping:** API and UI both assert amount validation (EXP-006/007 vs EXP-018/019) — intentional (client + server guards); do not collapse.

**Not recommended:** replacing the current Playwright setup, adding per-component E2E, or per-browser repetition of the whole suite.
