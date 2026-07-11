# TS-DES-205 — Analysis v2: Overview/Items/Merchants tab host

**Initiative:** Redesign v2 · **Build order:** 3rd (depends on 201; independent of 202/210) · **Spec:** `Redesign_Proposal_v2.md` §2 (lens) / §5 (Items/Merchants beyond rows), `ORIENTATION_REPORT_V2.md` §1 (TS-DES-106/107/108 verdicts) §2 (routing), `docs/design/prototypes/v2/Analysis.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Supersedes TS-DES-106, 107, and 108's component scope entirely. `v2/Analysis.jsx` merges what were
three separate pages/tickets into **one page with a `SubTabBar`: Overview / Items / Merchants**:

- **Overview tab** — TS-DES-106's original scope (`WhatChangedRail`, `CategorySpectrum`, `AskSheet`,
  `TrendNavigator`), narrowed to the two-way lens (`My Expenses`/`I Paid`, `Group Total` cut — same
  change as TS-DES-203's Dashboard lens; land both tickets at the same arity).
- **Items tab** — TS-DES-107's full component set (`StatBlock`, `PriceHistoryChart`→`PriceLine`,
  `StoreComparisonChips`→`StoreChips`, `PurchaseTape`) moves here near-verbatim, confirmed by direct
  comparison against `v2/Analysis.jsx`'s `ItemsTab`. The components are unchanged and reusable; only
  their host (a tab, not a standalone page/route) changes.
- **Merchants tab** — TS-DES-108's full component set (`StatBlock`, `MonthlySpendSparkline`,
  `WhatChangedCallout`) moves here the same way, mapped onto `v2/Analysis.jsx`'s `MerchantsTab`.

This ticket explicitly owns the **redirect contract** from TS-DES-202 for `/item-insights` and
`/merchant-insights`: those routes redirect (per 202) to `/analysis?tab=items`/`?tab=merchants`, and
this ticket is what makes those query-param targets actually resolve to the right tab with the right
`?item=`/`?merchant=` id preserved.

**Backend gap, unresolved, carried forward as-is (not re-litigated by this ticket):** per
`ORIENTATION_REPORT_V2.md` §3.1, `AnalysisResponse.category_totals`/`category_expense_details` are
flat single numbers with no per-category `my_share`/`i_paid` split (only the group-summary level has
that granularity today). Dropping the third lens doesn't remove this dependency — `My Expenses` and
`I Paid` still each need their own per-category number. Build the two-way lens UI now, aliased to the
existing scope filter (the same workaround TS-DES-106 already proposed), and leave the TODO in place
rather than blocking this ticket on the backend gap.

## Files it will touch

- `varavu_selavu_ui/src/pages/ExpenseAnalysisPage.tsx` — add the `SubTabBar` (`Overview`/`Items`/
  `Merchants`) host; existing Overview-tab content is the current page's content, narrowed to the
  two-way lens; `AskSheet`'s existing "Ask why" per-insight sheet (TS-DES-106) stays on the Overview
  tab, unmoved by this ticket.
- **New:** `varavu_selavu_ui/src/components/analysis/ItemsTab.tsx`,
  `varavu_selavu_ui/src/components/analysis/MerchantsTab.tsx` — host the migrated component sets
  from `ItemInsightsPage.tsx`/`MerchantInsightsPage.tsx` respectively; per
  `ORIENTATION_REPORT_V2.md` §4, a live visual check against the v2 component shapes specifically
  (not just "does a rebuilt page exist") is worth doing at implementation time before assuming this
  is purely a routing move — TS-DES-107/108 were marked built against **v1** prototype shapes.
- `varavu_selavu_ui/src/pages/ItemInsightsPage.tsx`, `MerchantInsightsPage.tsx` — become dead code
  once the redirect (TS-DES-202) and both tabs land; delete once confirmed no remaining route points
  at them directly.
- `AnalysisLensSwitch` — narrows from three-way to two-way (same change as TS-DES-203's Dashboard
  lens; the two tickets should land with matching lens arity, not drift independently).

## Acceptance criteria

- `ExpenseAnalysisPage` shows an `Overview`/`Items`/`Merchants` sub-tab bar; `Overview` is the
  default for bare `/analysis`.
- `/analysis?tab=items&item=<id>` and `/analysis?tab=merchants&merchant=<id>` deep-link directly into
  the correct tab with the correct item/merchant pre-selected — required for TS-DES-202's redirect
  and for the existing "Ask AI about this item/merchant" cross-links to keep working.
- Items tab shows the same `StatBlock`/`PriceLine`/`StoreChips`/`PurchaseTape` content the standalone
  page showed, confirmed against the actual `v2/Analysis.jsx` `ItemsTab` shape (not assumed
  equivalent to the old page).
- Merchants tab shows the same `StatBlock`/`MonthlySpendSparkline`/`WhatChangedCallout` content,
  same verification standard.
- Overview tab's lens switch shows exactly two options; `AskSheet`'s "Looked at: ..." chip and
  Fast/Deep picker behavior (if present on this page — confirm at implementation time) is unaffected
  by the lens-arity change.
- No broken cross-links: every existing "Ask AI about this item/merchant" button and chat deep-link
  that used to point at `/item-insights`/`/merchant-insights` resolves correctly to the new tab shape.

## Dependencies

TS-DES-201 (Slate tokens). Depends on TS-DES-202 for the redirect *source* existing (though this
ticket's own tab host can be built and tested independently via direct `?tab=` URLs before 202's
redirect lands). Independent of TS-DES-210.

## Test requirements

- Migrate `ItemInsightsPage.test.tsx`/`MerchantInsightsPage.test.tsx` assertions to target the new
  tab components rather than leaving them asserting against pages being deleted — per
  `ORIENTATION_REPORT_V2.md` §4, both are already flagged as having pre-existing stale `role="list"`
  assertions against an already-rebuilt implementation, worth fixing as part of this migration rather
  than carrying the staleness forward again.
- Manual verification: switch between all three tabs, confirm each shows correct data, confirm both
  query-param deep-link shapes work with a real item/merchant id, confirm the two-way lens produces
  correct totals on Overview.

## Implementation notes (post-build)

- **`ItemInsightsPage.test.tsx`/`MerchantInsightsPage.test.tsx` did exist** (contrary to this
  being assumed-migratable — confirmed by reading them first) and were migrated, not left red:
  moved to `components/analysis/ItemsTab.test.tsx`/`MerchantsTab.test.tsx` (co-located with the
  components, matching this codebase's convention), same assertions, just retargeted at the new
  component names/import paths. The `ORIENTATION_REPORT_V2.md` §4 "stale `role='list'` assertions"
  concern didn't apply — read both test files before migrating and their `role="list"` assertions
  already matched the live `role="list"` markup in `ItemInsightsPage.tsx`/`MerchantInsightsPage.tsx`
  (the components this ticket copied verbatim), so nothing was actually stale by the time this
  ticket ran.
- **Items/Merchants "quick-jump" chips removed from Overview, not repointed** — the old
  `ExpenseAnalysisPage.tsx` had `Items`/`Merchants` `Chip`s in its header linking to the old
  standalone routes. Rather than repoint them to switch tabs (redundant with the `SubTabBar`
  immediately below), they're deleted outright — confirmed against `v2/Analysis.jsx`'s reference,
  which has no equivalent chips, only the `SubTabBar` for this navigation.
- **Tab-switch clears `?item=`/`?merchant=`** — `handleTabChange` in the new
  `ExpenseAnalysisPage.tsx` explicitly deletes both params when switching tabs via the
  `SubTabBar` (not just setting `tab`), so navigating away from a specific item/merchant detail
  view via the tab bar doesn't leave a stale id param that would silently reopen a detail view if
  the user tabs back. Deep-linking directly to `?tab=items&item=X` (the redirect target, or a
  direct URL) still works exactly as before — only the *tab-switch* interaction clears the id.
- **`AnalysisLensSwitch` narrowed the same way `TrueTotalHero` was in TS-DES-203** — dropped
  `Group Total`, kept the `AnalysisScope` type itself unchanged (still has `group_total` as a
  valid value, since `ExpensesPage`'s unrelated `GroupScopeFilter` uses different values from the
  same shared type — `personal`/`groups`/`combined` — and touching the type itself risked breaking
  that unrelated consumer for no reason).
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing (2
  old test files deleted, 2 new ones added at their migrated location — net same suite count). The
  Playwright browser tool went through a transient mid-session outage (a "model temporarily
  unavailable" classifier issue affecting all `mcp__playwright__*` calls, unrelated to this
  ticket's code) that initially blocked live verification; it recovered and full live verification
  was completed against the running `web-ui` dev server: all three tabs (`Overview`/`Items`/
  `Merchants`) render and switch correctly, with the URL updating to `?tab=items`/`?tab=merchants`;
  Overview's lens shows exactly `My Expenses`/`I Paid`; clicked into an Items detail view (stat
  blocks showing correct positive/negative Slate colors, purchase history) and a Merchants detail
  view (sparkline, "what changed" callout, items-bought list); the "Ask AI" chip correctly
  navigated to `/ask?q=...`; both redirects confirmed with real query params —
  `/item-insights?item=Weekly+groceries` → `/analysis?item=Weekly+groceries&tab=items` (landed
  directly on the item detail view, not just the tab) and `/merchant-insights?merchant=Trader+Joes`
  → `/analysis?merchant=Trader+Joes&tab=merchants`; dark mode confirmed correct across the Overview
  tab (lens, trend nav, category breakdown) and a detail view.
