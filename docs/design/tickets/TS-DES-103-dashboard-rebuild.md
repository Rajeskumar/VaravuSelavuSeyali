# TS-DES-103 — DashboardPage rebuild: True Total + lens

**Initiative:** Reconcile UX Redesign · **Build order:** 2nd (parallel with 102/105) · **Spec:** `UX_Design_Spec.md` §4.6/§4.3/§6/§7, `UX_Audit_and_Redesign.md` §3.2/§4/§5, `ORIENTATION_REPORT.md` §2.2, `docs/design/prototypes/Dashboard.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Implementation notes (post-build)

- **`DashboardPage.tsx` fully rewritten** per scope: the `MetricCard` grid, the `cards` registry
  (`sunburstOther`/`sunburstRecurring`/`trend`/`insights`/`recent`/`quickAdd`/`upcoming`/`myGroups`),
  `editingLayout`/`layoutOrder` state, `onDragStart`/`onDragOver`/`onDrop`/`saveLayout`/`resetLayout`,
  and the `vs_dashboard_layout_v1` `localStorage` key are all gone — confirmed via `grep` that no
  reference to any of them remains in the file. The `templates`/`listRecurringTemplates` fetch and its
  recurring-vs-other category split (`sunburstRecurring`/`sunburstOther`/`recurringDetailMap`/
  `otherDetailMap`) were also dropped: they existed only to feed the two sunburst cards being retired,
  and `SpendSpectrum` uses `AnalysisResponse.category_totals` directly instead (a flatter, already-
  available field) rather than recomputing a recurring/other split for a spectrum the ticket didn't
  ask for.
- **New components** (`varavu_selavu_ui/src/components/dashboard/`): `TrueTotalHero.tsx`,
  `SpendSpectrum.tsx`, `MyGroupsStrip.tsx` — all per the ticket's file list, all built as plain function
  components with a typed `Props` interface rather than reusing any registry pattern.
  - `TrueTotalHero.tsx`'s `computeLensTotal(lens, personal, groupSummaries)` sums
    `AnalysisGroupSummary[lens]` (`my_share`/`i_paid`/`group_total`) across every group plus the
    personal-only portion — field names were verified two ways before use: (1) reading
    `varavu_selavu_app/varavu_selavu_service/models/api_models.py`'s `SpendBreakdown`/
    `AnalysisGroupSummary` Pydantic models, and (2) hitting the live
    `GET /api/v1/analysis?scope=combined` endpoint (backend already running locally) as
    `grouptester@example.com` and inspecting the actual JSON. Both matched `varavu_selavu_ui/src/api/
    analysis.ts`'s existing TS types exactly — no backend or API-client change was needed, as the
    ticket anticipated.
  - "Settled"/"pending" and the gold `RECONCILED` tick are computed from `my_balance` (`Math.abs(
    my_balance) < 0.005`), not from a `settled` boolean (the live `AnalysisGroupSummary` has no such
    field — Dashboard.jsx's prototype data has one only because it's hardcoded demo state).
  - The lens control reuses `SegmentedTabs` (`varavu_selavu_ui/src/components/common/SegmentedTabs.tsx`)
    unmodified, per the ticket's explicit instruction not to build a second segmented-control component.
- **`MyGroupsStrip.tsx` bug found and fixed during visual verification:** an initial pass computed each
  group's pending-amount chip as `group_total - i_paid`, which is a *paid-in* shortfall, not the same
  thing as the member's outstanding balance — it happened to read `$0.00 pending` for a group where the
  live `my_balance` was actually `200.0`, because that particular test group's `i_paid` equals its
  `group_total` (the tester paid the group's expenses in full but is still owed/owing personally).
  Fixed to `Math.abs(my_balance)`, matching the same balance field `TrueTotalHero` uses for its
  settled/pending determination, so the two surfaces can't disagree about which groups are settled.
- **Category spectrum coloring:** `Dashboard.jsx` hardcodes a color per literal category name (5 fixed
  categories). Real data has arbitrary category names/counts, so `SpendSpectrum.tsx` instead cycles a
  fixed 8-hue ramp by rank index (`colorFor(index)`) — same visual language (muted, Reconcile-adjacent
  hues), not tied to specific category strings.
- **Components fully retired and deleted** (confirmed via repo-wide `grep` that nothing outside
  `DashboardPage.tsx` referenced any of them before deleting): `MetricCard.tsx`,
  `CategoryBreakdownSunburst.tsx`, `QuickAddExpenseCard.tsx`, `UpcomingRecurringCard.tsx`,
  `SpendTrendChart.tsx`, `RecentActivityList.tsx`, `MyGroupsWidget.tsx`. Three unrelated dashboard
  components present in the same directory (`BudgetVsActualCard.tsx`, `MonthlyTrendChart.tsx`,
  `TopCategoriesChart.tsx`) were already unused before this ticket and are outside its scope — left
  untouched rather than opportunistically deleted.
- **Recent feed:** capped at 6 rows (`RECENT_FEED_LIMIT`) rather than the old `RecentActivityList`'s 10,
  to match Dashboard.jsx's "compact" framing (its reference mock shows 3); a "See all ›" link navigates
  to `/expenses`, which already exists as a route.
- **The one-time combined-scope toast and `scope=combined` fetch are untouched** — same
  `COMBINED_TOAST_KEY`/`localStorage` logic, same `getAnalysis({ year, scope: 'combined' })` call,
  restyled around rather than re-decided, per the ticket's explicit instruction.
- **Verified via `preview_start`/manual `npm start` + a live local backend** (`grouptester@example.com`
  / `TestPass123!` against `POST /api/v1/auth/login`, tokens injected into `localStorage` under the
  app's actual keys — `vs_token`/`vs_refresh`/`vs_user`, confirmed by reading `api.ts` rather than
  guessing): hero renders the correct combined total; the lens control re-scopes the same number
  correctly across all three lenses (confirmed against the live payload's per-group `my_share`/
  `i_paid`/`group_total`, including a case where "I Paid" and "Group Total" coincide for this
  particular seeded user — verified that's a property of the test data, not a bug, by re-checking the
  raw API response); the category spectrum, "My Groups" strip (3 groups, correct settled/pending
  states after the bug fix above), and "Recent" feed with working "See all" link all render in both
  light and dark mode; no console errors in either mode. `npx tsc --noEmit` is clean.
  `DashboardPage.test.tsx`'s existing 3 tests pass unmodified — the tests only assert on the analysis
  payload being fetched with `scope: 'combined'`, `$500.00` appearing, the `MyGroupsStrip`-rendered
  group name, and the toast text, none of which changed shape.
- **Environment note, not part of the ticket's scope:** the sandboxed worktree this was built in had
  fallen behind `feature/groups-phase-1`'s tip (stale by 13 commits) and was missing this initiative's
  uncommitted `docs/design/` tree and `theme.ts` token work entirely. Both were synced in from the
  primary working copy (fast-forward merge to the branch tip, plus copying the same uncommitted
  files) before any ticket work started, so the starting state matches what the ticket assumed.

## Scope

Retire the `MetricCard` wall (Total Expenses / This Month / This Week) and the drag-and-drop
"Customize Layout" registry (`sunburstOther`, `sunburstRecurring`, `trend`, `insights`, `recent`,
`quickAdd`, `upcoming`, `myGroups`, plus the `editingLayout`/`layoutOrder`/`onDragStart`/`onDrop`/
`saveLayout`/`resetLayout` machinery and its `localStorage`-persisted order) for the **True Total +
lens** pattern per `Dashboard.jsx`: one hero number (display face, tabular-nums), a `RECONCILED`/
"N groups still settling" status line under it, a three-way segmented lens (**My Share / I Paid /
Group Total**) that re-scopes that single number, a ranked category spectrum below it, a horizontally
scrollable "My Groups" strip, and a compact "Recent" feed with a "See all" link through to the
Expenses page.

This redesign is scoped and sequenced independently of the Groups feature. Per this initiative's
source-of-truth documents (`UX_Design_Spec.md`, `UX_Audit_and_Redesign.md`, `ORIENTATION_REPORT.md`),
the card-grid/registry structure this ticket removes is exactly what Reconcile is designed to
replace — see `ORIENTATION_REPORT.md` §2.2 for the full structural rationale. `docs/features/
TrackSpense_Groups_Product_Spec.md` is not consulted, referenced, or edited by this ticket.

**Web only.** Mobile's dashboard-equivalent screen (Home) is a different screen with its own
file-touch list and is out of scope here; flagging it as a needed follow-up for platform parity,
same as noted in TS-DES-102 for the Expenses surface.

## Files it will touch

- `varavu_selavu_ui/src/pages/DashboardPage.tsx` — remove: the three `MetricCard` grid, the entire
  `cards` registry object and `defaultOrder`/`layoutOrder` state, `editingLayout` state and its
  "Customize Layout"/"Save Layout"/"Reset"/drag-and-drop UI, and the `localStorage`
  (`vs_dashboard_layout_v1`) persistence. Replace with the new hero + lens + spectrum + groups-strip +
  recent-feed layout described above.
- **New component(s)** under `varavu_selavu_ui/src/components/dashboard/`:
  - `TrueTotalHero.tsx` — the display-face hero number, reconciled/pending status line, and the
    `My Share`/`I Paid`/`Group Total` `SegmentedTabs`-based lens (reuse the existing `SegmentedTabs`
    component from the Groups redesign rather than building a second segmented-control component).
    Computes the three lens totals from `AnalysisResponse`'s existing `spend_breakdown`/
    `group_summaries` fields (`my_share`, `i_paid`, `group_total` are already present per the Groups
    Product Spec's `AnalysisResponse` shape — no new backend field is expected to be required, but
    confirm the exact field names against the live `getAnalysis()` response at implementation time).
  - `SpendSpectrum.tsx` — the ranked category list + proportional stacked bar (Design Spec §4.3),
    replacing `CategoryBreakdownSunburst` on this page specifically (the sunburst component itself
    isn't necessarily deleted app-wide if other pages still use it — confirm at implementation time).
  - `MyGroupsStrip.tsx` — horizontally scrollable compact group cards (name, member count, settled/
    pending-amount chip), replacing `MyGroupsWidget`'s current grid-card presentation.
  - Reuse/extend the existing unified recent-transactions logic (`personalRecent`/`groupExpenses`
    merge already in the file) for a compact "Recent" list capped at a small count with a "See all"
    link to `/expenses`, rather than the current full `RecentActivityList` card.
- Components being fully retired from the Dashboard's registry as a result (confirm no other page
  depends on them before deleting outright — otherwise just stop referencing them here):
  `MetricCard` (Dashboard usage only), the drag/drop registry itself, `QuickAddExpenseCard`,
  `UpcomingRecurringCard`, `SpendTrendChart`'s card-grid placement (trend data may still inform the
  spectrum/hero but not as its own draggable card).
- Consumes tokens from `TS-DES-101` (`display-hero` role for the True Total, `gold` for the
  reconciled tick, `jade`/`ember` for owed/owe framing on group-strip chips, `amount`/`tabular-nums`
  throughout).

## Acceptance criteria

- Exactly one hero number is present above the fold; no `MetricCard` wall or draggable multi-card
  grid remains.
- The lens control re-scopes the **same** hero number between My Share / I Paid / Group Total —
  these are not three simultaneously-visible numbers.
- A `RECONCILED` (gold, per Design Spec §2's "gold appears maybe twice per session" scarcity rule)
  or pending-count status line appears under the hero, matching `Dashboard.jsx`'s reference behavior.
- A ranked category spectrum (stacked bar + ranked rows with amount + percentage) renders below the
  hero, replacing the sunburst as the primary category view on this page.
- A horizontally scrollable "My Groups" strip renders (only when `groupsEnabled`), each card showing
  name, member count, and a settled/pending chip using `jade`/`ember` per the money-color policy.
- A compact "Recent" feed renders with a link through to the full Expenses feed (`TS-DES-102`); it
  does not need to duplicate that ticket's full day-grouping/detail-sheet behavior, just show a
  capped recent list.
- The "Customize Layout" feature (drag-to-reorder, save/reset, `localStorage` persistence) is fully
  removed — no dead code, no orphaned `layoutOrder` reads.
- The one-time "Your totals now include your share of group expenses" explainer toast and the
  underlying `scope=combined` analysis fetch are preserved (this is existing Groups-integration
  plumbing this ticket restyles around, not something this redesign needs to re-decide).

## Dependencies

- **TS-DES-101** (tokens must be stable before this ticket's components consume them).

## Test requirements

- No new Jest suites required as a gate. Verify by running the web app locally, loading `/dashboard`,
  confirming: hero renders with the correct combined total, the lens switch re-scopes the same number
  correctly for all three lenses, the groups strip and recent feed render, and no console errors
  appear.
- If existing `DashboardPage`-related tests assert on the removed `MetricCard` grid or drag/drop
  behavior, update them to the new structure rather than leaving them red.
