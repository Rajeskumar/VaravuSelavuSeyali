# TrackSpense — Feature Status & Build Backlog

> **Purpose:** Single-glance status across every doc in `docs/` and `docs/features/`, verified directly against the current codebase (not just the spec docs). Use this to decide what to build next. Each item links to the full spec for detail.
>
> **Verified:** 2026-07-04, by full codebase audit (backend routes/services/db models, web pages/components, mobile screens).
>
> **Updated 2026-07-04 (later same day):** Items 2–4 from the recommended build order below, plus most of the remaining Analytics & Insights gaps (TS-ANL-002/003/004/005/007/008/009/010), were implemented and verified in-browser. Section 2 reflects the new state. **Mobile parity for this round of changes was not done** — all of this pass was web-only; the mobile Item/Merchant Insights and AI Analyst screens still reflect the prior state.
>
> **Status key:** ✅ Built · 🚧 Partial (some requirements met, real gaps remain) · ❌ Not built

---

## 1. Core Product (Section 3 of the master spec)

All shipped and working — verified via direct API/route inspection and live testing in a prior session.

| Area | Status | Notes |
|:---|:---|:---|
| Auth (register/login/Google OAuth/refresh/logout/forgot-password/profile) | ✅ Built | Includes `DELETE /auth/profile` (account deletion) with a real confirmation-dialog UX (type "DELETE" to confirm). As of TS-GRP-112, personal expenses are hard-deleted explicitly (no longer a DB-level cascade) while group expenses survive with the author anonymized — see §6 below |
| Expense CRUD + AI auto-categorization | ✅ Built | `POST/GET/PUT/DELETE /expenses`, `/expenses/categorize`, `/expenses/with_items` |
| Receipt OCR scanning | ✅ Built | `/ingest/receipt/parse`, fingerprint dedup, "Upload Receipt" UI on web (Add Expense dialog) |
| Recurring expense management | ✅ Built | Full CRUD + due/confirm/execute_now |
| Email / feedback (feature request, contact us) | ✅ Built | `/email/send`; web now has a dedicated `/contact` page too |
| Web + Android + iOS shipped | ✅ Built | — |

---

## 2. Analytics & Insights (TS-ANL series) — mostly built, with specific gaps

This is the area with the most nuance. The core pre-calculation pipeline is genuinely solid; the gaps are mostly in **UI completeness** and **two specific backend features that were designed but never wired in**.

| Spec | Status | What's missing |
|:---|:---|:---|
| [TS-ANL-001 — Insight Analytics Foundation](features/TS-ANL-001%20--%20Insight%20Analytics%20Foundation.md) | ✅ Built | `month_over_month_change_amount`/`_percent` are now populated in `calculate_merchant_metrics`/`calculate_item_metrics`, suppressed at low confidence (see TS-ANL-009) |
| [TS-ANL-002 — Merchant Insights](features/TS-ANL-002%20—%20Merchant%20Insights.md) | ✅ Built | Summary KPI cards (top merchant / total spend / avg basket / biggest riser), yearly rollup, recent-transactions list, highest transaction, spend-share %, empty state, and a filter-aware detail view all shipped (web only — mobile not updated this pass) |
| [TS-ANL-003 — Item Insights](features/TS-ANL-003%20—%20Item%20Insights.md) | ✅ Built | Personal-inflation / biggest-increase / most-frequent summary cards, avg monthly spend, purchase frequency, confidence badges, "Ask AI" deep-link chips, and a 2-merchant quality gate on store comparisons all shipped (web only) |
| [TS-ANL-004 — Smart Spend Change Insights](features/TS-ANL-004%20—%20Smart%20Spend%20Change%20Insights.md) | ✅ Built | All 7 insight types now implemented, including the previously-missing **unusual large transaction** (outlier vs. historical average) and **recurring bill increase** (vs. active `RecurringTemplate`s) detectors. Results are now ranked by relative magnitude, not insertion order |
| [TS-ANL-005 — AI Analyst Upgrade for Item/Merchant Qs](features/TS-ANL-005%20—%20AI%20Analyst%20Upgrade%20for%20Item%20and%20Merchant%20Questions.md) | ✅ Built | `build_rag_context()` is now called from `chat_service.py` before the LangGraph agent runs, injecting targeted item/merchant context into the system prompt when the query matches. The tool-calling agent still runs on top for follow-ups. Provider-default bug fixed separately |
| [TS-ANL-006 — Expense Save-Time Aggregation Pipeline](features/TS-ANL-006%20—%20Expense%20Save-Time%20Aggregation%20Pipeline.md) | ✅ Built | Full async pipeline (`background_tasks`), all 4 mutation endpoints wired, idempotent backfill script at `scripts/backfill_insights.py` with validation checks |
| [TS-ANL-007 — Insight Navigation and Discovery](features/TS-ANL-007%20—%20Insight%20Navigation%20and%20Discovery.md) | ✅ Built | Nav entries + dashboard discovery card, plus new cross-links: Item/Merchant Insights chips on the Analysis page header, and reciprocal links between the AI Analyst chat and both Insights pages (web only) |
| [TS-ANL-008 — Insight Filters and Time Scoping](features/TS-ANL-008%20—%20Insight%20Filters%20and%20Time%20Scoping.md) | ✅ Built | Custom start/end date range UI added (shared `InsightScopeFilter` component), an "active scope" badge now shows on both list and detail headers, and detail pages inherit the list page's active filter instead of always showing all-time. Also fixed a live bug where the item/merchant detail routes required `user_id` as a query param that the frontend never sent (a 422 on every click) — now derived from the auth token like every other analytics route |
| [TS-ANL-009 — Data Quality and Normalization Guardrails](features/TS-ANL-009%20—%20Data%20Quality%20and%20Normalization%20Guardrails.md) | 🚧 Partial | High/medium/low confidence classification now ships on every Item/Merchant summary and detail response; low-confidence claims are suppressed (MoM/trend hidden below 3 data points, store-comparison hidden below 2 distinct merchants); merchant-name grouping is canonicalized (trim+lowercase) to merge near-duplicate casing. **Not done:** item/unit-level canonicalization beyond the upstream OCR normalization, and any vector/fuzzy entity-resolution |
| [TS-ANL-010 — Insight Trust UX, Empty States, Loading States](features/TS-ANL-010%20—%20Insight%20Trust%20UX%2C%20Empty%20States%2C%20and%20Loading%20States.md) | ✅ Built | Merchant Insights empty state, Analysis page top-level empty state, and "Ask AI about this item/merchant" CTAs all shipped (web only) |
| [TS-ANL-011 — Insight API Surface and Response Models](features/TS-ANL-011%20--%20Insight%20API%20Surface%20and%20Response%20Models.md) | ✅ Built | All 4 endpoints, bearer auth, typed models, web + mobile API clients all wired correctly |
| [TS-ANL-012 — Historical Backfill and Analytics Validation](features/TS-ANL-012%20--%20Historical%20Backfill%20and%20Analytics%20Validation.md) | ✅ Built | `scripts/backfill_insights.py` clears + replays + validates (0.05 tolerance) against source-of-truth sums; covered by `tests/test_insight_analytics_service.py` |

**Remaining work, in order:**
1. Port this round's web changes to mobile (Item/Merchant Insights screens, AI Analyst suggested-prompt cross-links) — nothing here is mobile-specific, it just wasn't done this pass.
2. Deeper canonicalization for TS-ANL-009 (item/unit normalization, fuzzy/vector entity resolution) — current pass only handles merchant-name whitespace/casing.
3. Everything else in this table is now built; remaining gaps are in §3 (strategic AI vision) and §4 (launch readiness).

---

## 3. AI Analyst architecture — a different (and reasonable) path than either vision doc proposed

Two docs proposed competing designs for the analytics/AI layer:
- [AI Financial Analyst Feature.md](features/AI%20Financial%20Analyst%20Feature.md) — an ambitious "Medallion architecture" with `Vendors`/`Purchases`/`Canonical_Products`/`Purchase_Line_Items` tables, vector-embedding entity resolution, and a Text-to-SQL agent.
- [item-level-ai-analyst.md](features/item-level-ai-analyst.md) — a simpler, more concrete plan using `item_insights`/`item_price_history`/`merchant_insights`/`merchant_aggregates` tables with keyword-based RAG.

**What was actually built:** the schema from the *second* doc (simpler, pragmatic — good call). But the chat engine itself went a third way: `chat_service.py` implements a **LangGraph ReAct tool-calling agent** with three tools (`get_expense_summary`, `get_item_insights`, `get_merchant_insights`) that the LLM calls as needed — not the RAG-style pre-filtered context injection either doc proposed, and not the Text-to-SQL agent from the ambitious doc. This is a reasonable middle ground, but it means **TS-ANL-005's "intent routing" requirement was effectively superseded by a different architecture** rather than implemented as specified — worth deciding whether to formally update TS-ANL-005 to describe the tool-calling design instead of chasing the original spec.

| Vision-doc idea | Status |
|:---|:---|
| Pre-calculated aggregation instead of raw line items in LLM context | ✅ Built (item_insights / merchant_insights tables) |
| Chat can call tools for item/merchant data | ✅ Built (LangGraph agent, 3 tools) |
| Text-to-SQL agent | ❌ Not built (tool-calling used instead — arguably simpler/safer) |
| Personal inflation rate calculator | 🚧 Partial — Item Insights now shows a "Personal Inflation" summary card (average month-over-month price change across a user's items), but there's no dedicated calculation service/endpoint or historical index, just an aggregate of the per-item MoM fields |
| Store arbitrage / proactive "cheaper elsewhere" alerts | 🚧 Partial (the data exists — `item_price_history` + store comparison — but nothing surfaces it proactively; it's reactive-only, via chat or the Item Insights detail page) |
| "Zombie expense" / micro-habit clustering | ❌ Not built (only manual Recurring Templates exist) |
| Granular tax categorization | ❌ Not built |
| Vector-embedding entity resolution for merchant/item names | ❌ Not built (plain string/normalized-name matching only) |
| Dual-path hallucination validation of AI-generated numbers | ❌ Not built |

---

## 4. Launch Readiness (from `trackspense_feedback.md`)

That file already tracks launch-blocker checklist items with `[x]`/`[ ]`. Verified against code — see that file for the full checklist; changes made during this audit:
- ✅ Checked off "Collapse 'coming soon' app cards + roadmap into one line" — the current `HomePage.tsx` has no such content at all (verified: zero matches for "coming soon"/"roadmap" in the file).
- Everything else in that checklist was verified accurate as-is (see updated notes inline in that file).

**Still open and worth prioritizing (unchanged, still real gaps):**
- No automated IDOR test (a user can't currently be *proven* unable to read another user's data — the auth logic looks correct, but nothing tests it)
- Budgets: only a `localStorage`-backed dashboard card stub exists (`BudgetVsActualCard.tsx`) — no real backend, no full screen
- Savings goals: zero implementation
- Bank sync / Plaid: zero implementation (roadmap item, not urgent)
- Reviewer demo account for app store review: no seed script exists (a throwaway account was created ad hoc during a recent session for screenshots — `demo@trackspense.app` — but that's not a documented, reproducible seed process)
- Apple Privacy label / Google Play Data Safety form: business/compliance tasks, not code

---

## 5. How this file was produced

Four parallel codebase audits cross-referenced every requirement bullet in every spec against actual routes, services, DB models, and UI components (file:line evidence collected for each verdict). This is more reliable than trusting the spec docs' own "Future Roadmap" section (in the master spec), which was written in March 2026 and is now stale — e.g. it still describes Item-Level AI Analyst as "In Design" when it's substantially shipped.

---

## 6. TrackSpense Groups (TS-GRP series)

This is the new "Split & Track" shared expenses feature.

| Spec | Status | Notes |
|:---|:---|:---|
| [TS-GRP-103 — SplitEngine](features/tickets/TS-GRP-103-split-engine.md) | ✅ Built | Pure functions + exhaustive unit tests for split math (§3.4, §3.5, §7.3). |
| [TS-GRP-101 — ORM models & migrations](features/tickets/TS-GRP-101-schema-migration.md) | ✅ Built | SQLAlchemy models and Alembic migration for groups Phase 1 + E12 account deletion fix. |
| [TS-GRP-112 — Account-deletion cleanup](features/tickets/TS-GRP-112-account-deletion-cleanup.md) | ✅ Built | Fixes `AuthService.delete_user` to hard-delete personal expenses and anonymize `group_members.display_name` to "Anonymous User", matching the "Anonymous User" strategy resolved in the spec (§6.2/§17.3). |
| [TS-GRP-102 — GroupService + membership](features/tickets/TS-GRP-102-group-service.md) | ✅ Built | Group CRUD, registered/placeholder members, tokenized invites (create/accept). Leave/remove/delete balance-zero guards now wired to TS-GRP-104's real `BalanceService.net(m)` (no longer the interim "any activity" proxy). All routes behind `GROUPS_ENABLED` (default off, §13.4). |
| [TS-GRP-105 — Settlements](features/tickets/TS-GRP-105-settlements.md) | ✅ Built | Record/list/undo settlements between group members; never touches `expenses` or the analysis cache (rule TS-GRP-R2), verified by a test that checks spend totals before/after. Consumed by TS-GRP-104's `BalanceService`. |
| [TS-GRP-104 — Group expenses + BalanceService](features/tickets/TS-GRP-104-group-expenses-balances.md) | ✅ Built | Single-payer equal/exact/percentage group expenses (create/list/edit/delete, any member may edit), calling into `SplitEngine`. `BalanceService` implements §7.1 `net(m)` with a literal (non-simplified) pairwise-transfer ledger — verified against a hand-computed 3-member + settlement scenario (`Σnet == 0`). `AnalysisService.invalidate_cache()` called on every write, matching the personal `/expenses` routes. |
| [TS-GRP-106 — AnalysisService scope + double-count guard](features/tickets/TS-GRP-106-analysis-scope.md) | ✅ Built | `GET /analysis` gains `scope=personal\|combined\|groups` + `group_id` (default `personal`, byte-compatible for old clients — verified against `tests/test_analysis_e2e.py`). Retrofits the required `Expense.group_id.is_(None)` guard so a user's own authored group expenses are never double-counted at full amount. Cache key extended to a 7-tuple. **This was the rollout gate for `GROUPS_ENABLED` — now cleared.** |
| [TS-GRP-107 — Web: GroupsPage/GroupDetailPage/SplitEditor](features/tickets/TS-GRP-107-web-groups-pages.md) | ✅ Built | New `/groups`, `/groups/:id`, `/groups/join/:token` routes; `SplitEditor` (equal/exact/percentage, live rounding preview ported from `SplitEngine`), `BalanceList`, `SettleUpDialog`, `InviteDialog`, `GroupCard`, `MemberAvatarStack`. Verified end-to-end in a real browser against a live backend + Postgres dev DB (create group → member → invite → split expense → balances → settle up), zero console errors. `GroupsPage` treats a `404` (flag off) as a graceful empty state, since TS-GRP-111's client-facing flag surface doesn't exist yet. |
| [TS-GRP-108 — Web: dashboard/expenses scope integration + receipt group toggle](features/tickets/TS-GRP-108-web-scope-integration.md) | ✅ Built | Frontend-only: `DashboardPage` numbers become combined (unified recent feed, "My Groups" widget, one-time explainer toast); `ExpensesPage`/`ExpenseAnalysisPage` gain a Personal/Groups/Combined `GroupScopeFilter`; Add Expense form gains a Personal/Group toggle → equal-split group expense via `POST /groups/{id}/expenses`. Unified feed is composed client-side (`listAllMyGroupExpenses()`) since no backend endpoint returns it. **Backend bug found during smoke test and subsequently fixed (TS-GRP-108 note):** `ExpenseService.get_expenses_for_user`, `update_expense`, `delete_expense` now guard with `Expense.group_id.is_(None)` — matching `AnalysisService`'s existing guard. |
| [TS-GRP-109 — Mobile: Groups screens + split editor + deep-link invites](features/tickets/TS-GRP-109-mobile-screens.md) | ✅ Built | React Native parity for Phase 1 groups: new `GroupsScreen`, `GroupDetailScreen` (Expenses + Balances tabs), `JoinGroupScreen` (deep-link invite acceptance); components `SplitEditor` (Phase 1 equal-split), `BalanceRow`, `SettleUpSheet`; `App.tsx` gains Groups + GroupDetail + JoinGroup stack screens and 👥 Groups drawer item; `app.json` adds `trackspense://` scheme + Android `intentFilters`; `NavigationContainer` wired with `expo-linking` deep-link config; `AddExpenseScreen` gains Personal/Group toggle (hidden when flag off) with group picker; `analysis.ts` extended with `scope`/`group_id` params (TS-GRP-106 parity). 11/11 tests pass: §3.3 equal-share invariant (6 cases) + deep-link token parsing (5 cases). Stats/Activity tabs deferred as Phase 1 optional per §12.2. |
| [TS-GRP-110 — NotificationService + device_tokens + Expo push](features/tickets/TS-GRP-110-notifications.md) | ✅ Built | New `device_tokens` table (Alembic migration `fdb24441b181`) + `NotificationService` (`register_device`/`unregister_device` upsert, `fan_out` batched Expo push). Fan-out wired into group-expense create/edit/delete, settlements, and member-join (`background_tasks.add_task`, mirroring the existing insights-aggregation pattern) — excludes the actor, includes the recipient's share delta on edits only when it changed, and personalizes "paid you $X" for the settlement recipient. New `POST`/`DELETE /devices/register` routes (gated behind `GROUPS_ENABLED`). Mobile: `expo-notifications`/`expo-device` added, registration wired into `AuthContext` (login + app-start + logout), tap-to-deep-link handler added to `App.tsx`. A push send failure is caught and logged, never raised into the route — verified with a mocked Expo failure. Token pruning uses the immediate send-response error (not the full two-step Expo receipts flow) — see ticket notes. Backend: 14 new tests (101 total passed, 2 pre-existing skips). Mobile: 12 new tests (28 total passed). |

