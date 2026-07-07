# TS-DES-111 — Dashboard period bug, added insights, global Add Expense entry point

**Initiative:** Reconcile UX Redesign · **Build order:** 5th (follow-up to TS-DES-103; no dependency on batch-2 tickets) · **Spec:** `UX_Design_Spec.md` §4.6/§5, `UX_Audit_and_Redesign.md` §3.2 · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Three related, user-reported items addressed together as one small ticket, per explicit instruction
(none individually warrants its own review cycle):

1. **Bug: `DashboardPage.tsx` fetches the whole calendar year, not the current month, while
   labeling itself as if it were month-scoped.** `getAnalysis({ year, scope: 'combined' })` never
   passes `month` — confirmed against `AnalysisService.analyze`: `year` alone (no `month`) returns
   the full year's totals. Yet `TrueTotalHero`'s `periodLabel` reads `"{Month} {Year} · everything"`
   (e.g. "July 2026 · everything"), which claims a single-month scope the underlying data doesn't
   have. `SpendSpectrum`'s category breakdown comes from the same fetch, so it's affected too. Fix:
   pass the current month, matching the default already used by Analysis/Item/Merchant Insights (and
   now the chat agent, `TS-ANL-013`) — Dashboard was the one surface still doing something different.
2. **Additional glanceable insights**, using data that's already fetched or one call away — not a
   return to the old MetricCard/registry wall TS-DES-103 removed, just three small additions to the
   existing hero/spectrum/groups/recent layout:
   - A month-over-month delta line under the hero total (`monthly_trend` already has multiple
     months — no new API call).
   - A single top "what changed" teaser sourced from the same data `SmartChangeInsightsCard` (on the
     Analysis page) already uses, linking into Analysis rather than duplicating that page's full
     card list.
   - A compact "Due Soon" recurring-bills strip. `UpcomingRecurringCard` was deleted in TS-DES-103 as
     part of retiring the old card-grid registry — this isn't reviving that component, it's a new,
     Reconcile-styled compact strip matching `SpendSpectrum`/`MyGroupsStrip`'s established look
     (flat hairline surface, `typeScale.label` eyebrow), not the old card's styling.
3. **No persistent "Add Expense" entry point on web.** Confirmed via grep: no `Fab` used anywhere in
   `varavu_selavu_ui`; "Add Expense" only exists inside `ExpensesPage`'s own dialog plus a couple of
   page-specific cross-links. Mobile already has the right pattern (a center "+" tab in the bottom
   tab bar — called out positively in `UX_Audit_and_Redesign.md` §3.7 as "good bones, keep it"), so
   this is bringing web to parity with mobile's existing pattern, not inventing a new one. Add a
   persistent FAB in `MainLayout.tsx` (confirmed it wraps every authenticated route) that opens the
   same `AddExpenseForm` dialog `ExpensesPage` already uses — reused, not rebuilt.

**Web only.** Mobile already has the persistent add-expense entry point; the Dashboard period bug
and insight additions are web-`DashboardPage`-specific (mobile's `HomeScreen.tsx` was not audited as
part of this ticket — flagging, not assuming it has or doesn't have the same period-scoping issue).

## Files it will touch

- `varavu_selavu_ui/src/pages/DashboardPage.tsx` — add `month: now.getMonth() + 1` to the
  `getAnalysis()` call; compute the month-over-month delta from `data.monthly_trend` and pass it to
  `TrueTotalHero`; fetch `getChangeInsights` (top 1 result only) for the new teaser; fetch
  `listRecurringTemplates` for the new Due Soon strip (this was removed from Dashboard entirely in
  TS-DES-103 along with the sunburst cards that used to consume it — reintroducing the fetch, not
  the old card).
- `varavu_selavu_ui/src/components/dashboard/TrueTotalHero.tsx` — accepts a new optional
  `momDelta?: { amount: number; percent: number } | null` prop, rendered as a compact line under the
  hero total (money-color policy: ink-neutral framing with a small directional +/− and jade/ember
  tint, not a loud alert — this is a trend indicator, not a warning).
- **New components** under `varavu_selavu_ui/src/components/dashboard/`:
  - `WhatChangedTeaser.tsx` — single top insight (reusing `ChangeInsight`/`getChangeInsights` from
    `api/analytics.ts`, the same data `SmartChangeInsightsCard` uses), styled to match
    `SpendSpectrum`/`MyGroupsStrip`'s flat hairline convention, with a "See all →" link to `/analysis`.
  - `DueSoonStrip.tsx` — compact list (2-3 rows) of active (`status !== 'Paused'`) recurring
    templates ranked by proximity of `day_of_month` to today (handles month wraparound), each row
    showing description + cost + "Due in N days"/"Due {date}", linking to `/recurring`.
- `varavu_selavu_ui/src/components/layout/MainLayout.tsx` — add a persistent `Fab` (bottom-right,
  standard MUI placement) rendering an `AddExpenseForm` inside a `Dialog`, mirroring the existing
  open/close/toast pattern in `ExpensesPage.tsx` (`open`/`editing`/`toast` state, `queryClient.invalidateQueries(['expenses', user])` on success so any page showing expense data picks up the new entry without a manual refresh).

## Acceptance criteria

- Dashboard's hero total, month-over-month delta, and category spectrum all reflect the **current
  month only** — verified by comparing the hero total against `ExpenseAnalysisPage` with Month =
  current month, Overall Year off (same underlying data, should match).
- The `periodLabel` text and the actual data scope now agree (no more "July 2026" label over
  year-wide numbers).
- Month-over-month delta renders correctly (including the "N/A" case for a user's very first month
  of data, where there's no previous month to compare against — don't crash or show a nonsensical
  "+Infinity%").
- The what-changed teaser shows the single most significant change for the current month and links
  to `/analysis`; if there are no significant changes, it doesn't render an empty/awkward card (same
  empty-state discipline `SmartChangeInsightsCard` already has).
- The Due Soon strip shows only active templates, ranked by actual proximity to today (not creation
  order or alphabetical), and doesn't render if there are no active templates.
- A "+" FAB is visible and clickable from every authenticated route (Dashboard, Expenses, Groups,
  Analysis, Insights, AI Analyst, Recurring, Profile — confirmed via `App.tsx`'s route list, all
  wrapped in `MainLayout`), opens the same Add Expense form used on `ExpensesPage`, and a
  successfully-added expense is reflected on `ExpensesPage`/`DashboardPage` without a manual page
  refresh.
- Dark mode verified for all of the above (new components follow the established
  `SpendSpectrum`/`MyGroupsStrip` token usage, so this should be low-risk, but confirm).
- No backend or API-client changes — everything above is served by existing endpoints
  (`GET /analysis` with an added `month` param it already supported, `GET /analytics/changes`,
  `GET /recurring/templates`).

## Dependencies

None. Builds directly on `TS-DES-103`'s already-implemented `TrueTotalHero`/`SpendSpectrum`/
`MyGroupsStrip` and `DashboardPage.tsx` structure; the FAB addition touches shared `MainLayout.tsx`
but doesn't depend on any batch-2 ticket (106–110).

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's established
  approach — manual verification against the running app.
- Manual verification: run the web app, confirm the Dashboard's numbers match a month-scoped
  `ExpenseAnalysisPage` view, the new MoM delta/what-changed teaser/Due Soon strip all render
  correctly against real data (including each one's empty state), the FAB opens/adds/closes
  correctly from at least three different routes, and dark mode holds up throughout.
- `DashboardPage.test.tsx` (existing, 3 tests) must still pass or be updated if the added `month`
  param changes what it asserts the fetch call looks like — check before assuming it's unaffected.

## Implementation notes (post-build)

- **Bug fix confirmed and applied exactly as scoped:** `getAnalysis({ year, scope: 'combined' })` →
  `getAnalysis({ year, month: now.getMonth() + 1, scope: 'combined' })`. `periodLabel` (already
  correct — "{Month} {Year} · everything") needed no change; only the underlying fetch was wrong.
- **`DashboardPage.test.tsx` did need updating** — one of its 3 existing tests asserted the mocked
  `getAnalysis` call args without a `month` key; updated that assertion to include
  `month: <current month>` rather than leave it silently passing on stale expectations (a test that
  doesn't check `month` at all would have kept passing before *and* after this fix without ever
  catching the bug — tightened it so it actually would have caught this).
- **Month-over-month delta:** initially planned to read both months from `data.monthly_trend`, but
  once the main fetch is scoped to a single month (the bug fix above), its own `monthly_trend` only
  ever contains that one month's entry — verified live via
  `GET /analysis?year=2026&month=7&scope=combined` → `monthly_trend: [{"month": "2026-07", ...}]`,
  no prior-month entry. Added a second, year-wide (no `month`) fetch into its own `yearTrend` state
  purely to source the delta from, matching current/previous `"YYYY-MM"` keys against it. Returns
  `null` (not zero, not a crash) when there's no previous-month entry (a brand-new user's first
  month), and `TrueTotalHero` simply omits the delta line in that case.
- **`WhatChangedTeaser.tsx`:** calls `getChangeInsights({ year, month })` with the same resolved
  current-month scope as the main fetch (not a separate, potentially-inconsistent scope), takes only
  `insights[0]` (already ranked by relative magnitude per `TS-ANL-004`), and renders nothing if the
  array is empty — matching `SmartChangeInsightsCard`'s own empty-state discipline rather than
  showing an awkward blank card.
- **`DueSoonStrip.tsx`:** "proximity to today" is computed by finding the next occurrence of each
  template's `day_of_month` on/after today (wrapping to next month if that day already passed this
  month), sorting ascending, and taking the top 3. Templates with `status === 'Paused'` are excluded
  entirely (a paused bill isn't "due soon," it's not due at all).
- **FAB in `MainLayout.tsx`:** deliberately scoped to *personal* expense entry only (opens
  `AddExpenseForm` with `existing={null}`, the same default `ExpensesPage` uses for "Add Expense") —
  it does not attempt to handle group-scoped expense entry from a global control; that flow already
  exists on `GroupDetailPage` itself and wiring group-context into a page-agnostic FAB would need
  the FAB to know which group (if any) is contextually relevant, which is out of scope here. On
  success, invalidates the same `['expenses', user]` query key `ExpensesPage` uses (covers any
  react-query-based page), so a user who adds an expense from, say, the Analysis page and then
  navigates to Expenses sees it without a manual refresh.
- **Cross-page refresh gap found and fixed:** `DashboardPage` doesn't use react-query — it fetches
  via plain `useState`/`useEffect` — so the query-cache invalidation above has no effect on it. Adding
  an expense via the FAB while on/returning to the Dashboard did not update its hero, MoM delta,
  what-changed teaser, or recent feed. Fixed with a small dependency-free event bus
  (`utils/expenseEvents.ts`, a `window` `CustomEvent('vs:expense-changed')`): `MainLayout`'s
  `handleSuccess` calls `notifyExpenseChanged()` in addition to the query invalidation, and
  `DashboardPage` listens via `onExpenseChanged()`, bumping a `refreshKey` state value that's included
  in the dependency arrays of its main analysis fetch, the `yearTrend` fetch, the change-insights
  fetch, and the personal-recent-feed fetch (the recurring-templates fetch was left out — adding an
  expense doesn't change recurring templates).
- **Verified live** (`preview_start` "web-ui", real backend, `dashtest@example.com` — the previously
  used `grouptester@example.com` test account's credentials had stopped working, unrelated to this
  ticket, so a fresh account was seeded instead): Dashboard hero/spectrum now match
  `ExpenseAnalysisPage`'s current-month view exactly (cross-checked the total: $162.50 for July only,
  correctly excluding a June-dated seed expense). MoM delta showed "+442% vs last month" the first
  time it had a real prior month to compare against, and "+525% vs last month" after adding a further
  test expense. What-changed teaser and Due Soon strip render correctly against real data. FAB tested
  from the Dashboard: added a "FAB refresh test" $15.25 expense and confirmed — without any manual
  page refresh — the hero total went from $172.25 to $187.50, the MoM delta recalculated, the
  what-changed teaser updated, and the new expense appeared at the top of the Recent feed. Dark mode
  checked on all new elements. `npx tsc --noEmit` clean; full Jest suite run — `DashboardPage.test.tsx`
  (3/3) and all other suites pass except two pre-existing, unrelated failures already present before
  this ticket (`ItemInsightsPage.test.tsx`/`MerchantInsightsPage.test.tsx`, stale `role="list"`
  assertions against an already-rebuilt page implementation) and one pre-existing `matchMedia`/jsdom
  environment failure in `App.test.js` (`ThemeModeContext.tsx`, untouched by this ticket).
