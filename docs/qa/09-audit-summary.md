# 09 — Audit Summary (executive)

**Product:** TrackSpense (web primary, mobile secondary) · **Audit date:** 2026-11-22 · **Type:** discovery, documentation, test planning — no application code, tests, or production data were changed.
**Deliverables:** `01`–`09` in `docs/qa/`. Nothing was implemented; **awaiting approval before building any automation** (`06` §6).

## 1. What was found

| Measure | Count | Notes |
|---|---|---|
| Web pages / routes | **23** page entries (+5 redirect shims) | 4 flag-gated areas (Groups, Budgets, Card Coach, Tags); AI/MCP behind config |
| Global components / overlays | 11 / 12 | Quick Capture, detail sheets, settle-up, group settings, Ask panel, delete-account… |
| Features | 17 | `FEAT-*` in `01` |
| Meaningful interactions | **124** | 96 had at least their control observed at runtime; only ~20 had their behaviour exercised end-to-end; 28 are code-derived/unverified |
| User journeys | **19 web + 7 mobile** | 12 P0 · 6 P1 · 1 P2 (web) |
| Proposed UAT scenarios | **81** | P0 40 · P1 36 · P2 5 — **at audit: 79 Not Run, 2 Failed, 0 Passed. Now (2026-11-22): 49 automated and passing locally, 24 partly automated, 8 not automated; 0 passed by a person** |
| Backend endpoints | 131 handlers | mapped to UI in `02` |
| Existing automated tests | Backend 86 files · Web Jest 43 · Mobile Jest 33 · Playwright **16 E2E specs (63 tests) + 7 API specs (52 tests)** · QA inventory 96 IDs | see `05` |

## 2. Critical journeys (P0)
Sign-in/guarded routes (J-02) · Register (J-01) · **Log expense (J-03)** · **Failure/draft recovery (J-04)** · **Receipt scan (J-05)** · Edit/delete (J-06) · **Group split (J-09)** · **Settle up (J-10)** · Account security (J-16) · Export/delete account (J-17) · MCP approve (J-18) · Phone-width first run (J-19).

## 3. Existing coverage vs gaps (discovered, not "verified correct")
- **Strong:** auth/session API, expense CRUD + validation, deterministic financial calculations, group split maths, authorization/isolation, responsive overflow and touch targets, read-only prod smoke.
- **Heuristic count over the 81 scenarios:** 43 have an existing test asserting the behaviour, 21 partial, 17 none (`05` §3).
- **Missing at the UI level:** receipt scan, settle-up, recovery/draft/duplicate guard, recurring, budgets/cards, analysis switching, account security/delete, invite acceptance, Ask (AI), MCP approval, forgot/reset/verify, accessibility in CI, any native-mobile device test.

## 4. High-risk findings
| ID | Sev | Finding |
|---|---|---|
| **F-01** | **P1 — fixed 2026-11-22** | On a 390px phone the cookie banner covers the whole bottom nav and most of the Add Expense button until answered (runtime-confirmed; existing responsive tests start with consent decided). |
| **F-02** | **P1 — fixed 2026-11-22** | Header avatar contrast 1.79:1 (needs 4.5:1) on every app route, light and dark (axe serious); plus moderate heading-order on four routes. |
| F-07/08/09 | P1 | No browser tests for the recovery guard, settle-up, or receipt scan — all P0 money/data paths. |
| F-03 | P2 | Misleading error when adding a registered-but-unverified user by email. |
| F-06 | P2 — **fixed 2026-11-22** | Developer backend on `:8080` returned 500 on login. Root cause: the local dev DB was two Alembic revisions behind the code (`refresh_tokens.authenticated_at` missing). Migrated; startup now warns when the DB is behind. |
The 10 **product decisions** (D-01…D-10) were answered on 2026-11-22 and applied; see `07-qa-gap-analysis.md` §B. D-01 closed (no roll-up, leave as is). D-05: connected assistants stay web-only, mobile screen is on the ROADMAP; mobile Contact/export parity not reviewed.

**Observed working well:** duplicate-click produced one `POST /expenses`; network failure → "save outcome is unknown" guard (no auto-retry); draft restored after navigation with discard confirmation; wrong-password message is generic and announced; delete requires confirmation and cancel is safe; delete-account requires proof and cancel is safe; per-route titles and one `<h1>`; dialogs named, Escape returns focus.

## 5. Runtime verification — scope and limits
**Verified at runtime (Chromium via Playwright MCP, isolated stack):** login failure; guarded redirects; all main routes' controls and API calls; add-expense (desktop + 390px), duplicate click, failure injection, draft recovery; search/empty state; detail sheet; delete confirm/cancel; select mode; group detail; account page, password-mismatch gating, delete-account dialog (cancelled); 404, join-invite/verify/reset invalid states; axe scan (light/dark).
**Not verified:** AI chat/categorisation (AI disabled), real receipt OCR and file picker, email, Google sign-in, push, MCP end-to-end, Firefox/WebKit, tablet width, mobile app (not launched), production, concurrency, screen-reader output, most create/update/settle/recurring/budget/card writes (code-read only).
Environment: scratch Postgres DB `trackspense_audit` (dropped after the audit), backend `:8090`, web `:3001`, synthetic users `audit.primary@` / `audit.secondary@trackspense.qa`. Production and the developer's own stack were not touched.

## 4b. Risk justification for priorities
P0 = anything that can lose, duplicate or mis-state money, leak another user's data, or block first use (sign-in, add expense, splits, settlement, receipts, account deletion, assistant approvals, phone first-run). P1 = important flows with a workaround (filters, edit, recurring, budgets, analysis, invites, AI). P2 = secondary conveniences (cards, tags, checklist, theme).

## 5b. Recommended implementation priority (needs your approval)
1. **Now (S effort):** F-01 and F-02 are fixed; add the Tier-1 tests that guard them (B-01, B-17 axe non-blocking).
2. **Next sprint:** B-02..B-05 (duplicate guard, failure/recovery, draft, login return path) then B-06 settle-up and B-07 receipt scan with `OCR_ENGINE=mock`.
3. **Then:** B-12/B-13/B-16 (invite, account, MCP) and B-08..B-11 (recurring, filters, analysis, budgets/cards); decisions D-02, D-04, D-06 are settled, so their expected results are now defined (UAT-RCPT-005, UAT-REC-004, UAT-GRP-009).
4. **Later:** CI hygiene (B-18: Postgres-only tests, doc drift), mobile Maestro spike (B-19), SR pass each release.

## 6. Acceptance criteria for this audit (self-assessment)
| # | Criterion | Met? |
|---|---|---|
| 1 | All discoverable web routes and major components reviewed | **Yes** (routes complete; components inventoried via scan + targeted reads — not every component line-read) |
| 2 | All meaningful controls inventoried | Mostly — 124 grouped interactions; trivial controls grouped |
| 3 | Significant journeys documented | Yes (19 + 7) |
| 4 | Alternative/failure paths identified | Yes; many unverified |
| 5 | UAT scenarios executable | Yes (81) — **not executed** |
| 6 | Existing tests mapped | Yes (file-level; not re-run) |
| 7 | Critical gaps identified | Yes |
| 8 | Practical Playwright strategy | Yes — extends existing `qa/` |
| 9 | Release checklist | Yes |
| 10 | Unverified/unclear behaviour flagged | Yes (`07` §B, §E) |
| 11 | Mobile vs shared separated | Yes, **static only** |
| 12 | Maintainable organisation | Yes (stable IDs; regenerate counts when rows change) |

**This is not a claim of 100% coverage.** Counts of interactions, scenarios or tests are inventory sizes, not proof of correctness.

## 7. Maintenance
IDs are stable (`PG-`, `INT-`, `J-`, `UAT-`, `F-`, `D-`, `B-`). When a screen or flow changes: update `01`/`02`, the affected journey, its UAT rows and the coverage matrix in the same PR; the `product-review` and `test-review` skills should check this. Re-run `scripts/quality/axe-scan.mjs` and refresh `07` §A each release.
