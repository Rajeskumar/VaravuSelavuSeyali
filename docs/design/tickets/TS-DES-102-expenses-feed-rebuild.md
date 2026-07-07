# TS-DES-102 — ExpensesPage rebuild: unified day-grouped feed

**Initiative:** Reconcile UX Redesign · **Build order:** 2nd (parallel with 103/105) · **Spec:** `UX_Design_Spec.md` §4.1/§4.6/§7, `UX_Audit_and_Redesign.md` §3.3/§4/§5, `ORIENTATION_REPORT.md` §2.1, `docs/design/prototypes/ExpenseFeed.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Implementation notes (post-build)

- **Both old rendering paths are fully retired.** `ExpensesPage.tsx` no longer imports `Table`/
  `TableHead`/`TableRow`/`TableCell`/`TableBody`/`TableContainer` at all, and the old `<Box>`-row
  `unifiedRows` map is gone. All three scopes (`personal`/`groups`/`combined`) now build a single
  `FeedExpense[]` array and render it through one `<ExpenseFeed />`.
- **New files, all under `varavu_selavu_ui/src/components/expenses/`:**
  - `ExpenseFeed.tsx` — day-grouping (`groupByDay`, sorts desc via `parseAppDate`, buckets by
    `Date.toDateString()`), sticky day header (`position: sticky; top: 0`) with `TODAY`/`YESTERDAY`/
    `MMM D` label + tabular subtotal, row = tint dot + merchant-or-description + category/group-name
    caption + `typeScale.amount` tabular figure, "◐ your share · $X total" caption for group rows,
    hover-reveal edit/delete (`.expense-row-actions` opacity transition on `:hover`, force-visible via
    `@media (hover: none)` so touch/coarse-pointer devices — which never fire `:hover` — always show
    the affordance instead of hiding it behind a gesture this ticket didn't build), infinite-scroll via
    `IntersectionObserver` on a bottom sentinel instead of a `Load More` button.
  - `ExpenseDetailSheet.tsx` — tap-to-open detail with inline edit (merchant, category, amount, notes)
    + delete (with an inline confirm step, not a separate dialog). Uses MUI `Drawer` with
    `anchor={isDesktop ? 'right' : 'bottom'}` (breakpoint: `theme.breakpoints.up('sm')`) rather than a
    bespoke bottom-sheet like the JS prototype — `Drawer` already gives both anchor behaviors for free
    and matches Design Spec §5's "bottom at mobile, side panel at desktop" guidance directly.
  - `categoryColors.ts` — new `categoryTint()` mapping. Confirmed by search (`TopCategoriesChart.tsx`,
    `CategoryBreakdownSunburst.tsx`) that no existing category→color table exists anywhere in the app;
    both of those assign colors by array index/plotly colorway, not by category name, so neither was
    reusable as-is per the ticket's "confirm before adding a new table" instruction. The new table's
    keys match `AddExpenseForm`'s `CATEGORY_GROUPS` main categories and the hex values from
    `ExpenseFeed.jsx` directly; unknown/legacy category strings fall back to a deterministic string
    hash so they still get a stable color instead of all collapsing into one "other" gray.
- **`AddExpenseForm.tsx` touched beyond the ticket's file list, and why:** exported `CATEGORY_GROUPS`
  and `findMainCategory` (previously module-private) so `ExpenseFeed`/`ExpenseDetailSheet`/
  `ExpensesPage` could derive a row's main category (for the tint dot) and populate the detail sheet's
  category dropdown from the same taxonomy, rather than re-declaring a second copy of the category
  tree. No behavior change to `AddExpenseForm` itself.
- **Judgment call — group-expense edit and the missing split data:** the group-expense list endpoint
  (`GET /groups/{id}/expenses`) returns `payer_summary` (member_id + amount_paid) but not the original
  split type/entries, and Phase 1 group expenses are always equal-split (`AddExpenseForm` never offers
  exact/percentage). So `ExpensesPage.handleDetailSave` threads the row's `payer_summary` through as
  `FeedExpense.payerSummary` and, on save, re-submits `updateGroupExpense` with the same payer(s) and
  an equal split across them — reproducing current behavior for every group expense that exists today,
  without a split editor in this ticket's scope. If group expenses ever gain non-equal splits, editing
  one through this sheet will silently re-flatten it to equal — flagged here rather than silently
  shipped; a real "edit split" flow is a follow-up, not a regression introduced now (no editable-split
  UI existed anywhere in the old `<Box>`-row path either).
- **Judgment call — detail sheet edits merchant, not description.** The reference prototype's detail
  sheet edits `merchant`/`category`/`amount`/`notes`, not `description`. Personal expenses have a
  separate `description` field ("Coffee run") from `merchant_name` ("Starbucks") that can legitimately
  differ; the sheet now preserves `expense.description` unchanged on save so editing the merchant field
  can't silently clobber a distinct description. Same reasoning applied to `date` — the sheet doesn't
  expose a date field to edit, so `expense.date` (already the correct `MM/DD/YYYY` shape both update
  endpoints expect) is passed through untouched rather than round-tripped through `Date`/ISO parsing.
- **Found, not fixed — `notes` has no backend field.** Neither `ExpenseRecord` nor `GroupExpenseRow`
  has a `notes` column; the detail sheet still renders a Notes field (matching the prototype and the
  ticket's acceptance criteria list) but it is not wired to persist anywhere — saving silently drops it.
  This is a pre-existing backend gap (no `notes` column on either expense table), out of scope for a
  web-only UI ticket with no backend file in its touch list. Flagging for a follow-up if the field is
  meant to be real.
- **Found, not fixed — `AddExpenseForm`'s default expense date can land a day off from local "today."**
  `AddExpenseForm` defaults new expenses' date via `new Date().toISOString().split('T')[0]`, which
  reads UTC, not local time; observed during manual verification (system local time was still July 5
  evening but the UTC date had already rolled to July 6). This is pre-existing behavior in a file this
  ticket only touched for two new named exports — not investigated or fixed here, since it's orthogonal
  to the feed/detail-sheet rebuild itself and `ExpenseFeed`'s day-grouping/labeling is correct for
  whatever date string it's given.
- **Infinite scroll:** wired via `IntersectionObserver` on a sentinel `<Box>` at the end of the feed,
  gated to `scope === 'personal'` (the only scope with real pagination — groups/combined already fetch
  their full unpaginated sets). No `Load More` button remains anywhere in `ExpensesPage.tsx`.
- **`ExpensesPage.test.tsx` updated, not left red** (per the ticket's test-requirements note): 3 of 4
  existing tests were already failing on the `feature/groups-phase-1` tip *before* this ticket's changes
  (verified via `git stash` A/B) — a stale `/Add New Expense/i` text match against `AddExpenseForm`'s
  actual "Add Expense" heading, and a delete test that assumed immediate deletion when the row's delete
  button has always opened a confirm dialog first (`setPendingDelete`/`setConfirmOpen`, unchanged from
  the old `<Table>` row). Fixed those pre-existing breaks in the same pass as updating the 4th test's
  assertions for the new day-grouped DOM (`getByText('$45.00')` now matches twice — the day-subtotal
  header and the row — so it asserts a count instead of a single match; added an assertion for the new
  "$X total" secondary caption on group rows). All 4 tests pass now.
- **Verified via `preview_start` + manual API calls, not by assertion:**
  - `tsc --noEmit` clean in `varavu_selavu_ui`.
  - `CI=true react-scripts test --watchAll=false`: 32/33 pass; the one failure
    (`App.test.js` → `window.matchMedia is not a function` in `ThemeModeContext.tsx`) is pre-existing
    (confirmed via `git stash` A/B), unrelated to this ticket, and outside its file list.
  - Logged in as `grouptester@example.com` against the local backend, injected `vs_token`/`vs_refresh`/
    `vs_user` into `localStorage`, and drove `/expenses` in the running dev server: added a personal
    expense end-to-end (`POST /api/v1/expenses` → 201, feed updated without reload), opened the detail
    sheet and edited+saved it (`PUT /api/v1/expenses/{id}` → 200, sheet closed, row updated in place),
    confirmed the Groups scope renders real seeded group expenses ("Dinner"/Apartment 4B, "Flights"/
    Iceland Trip) with correct day-grouping across very different dates (a July row and a January row
    each got their own sticky header/subtotal) and correct "your share · $X total" captions, and
    confirmed Combined scope correctly merges personal + group rows into shared day buckets with a
    correctly-summed subtotal ($42.10 + $90.00 = $132.10). Also opened the mobile-width
    (`Drawer anchor="bottom"`) variant of the detail sheet directly via DOM inspection and confirmed
    its fields/buttons render correctly. No console errors observed in any of these flows.
  - Note on tooling: this sandbox's screenshot capture was intermittently stale/cached relative to the
    live page during scope-toggle clicks (confirmed by cross-checking `document.body.innerText` and the
    accessibility-tree snapshot against the same moment — those two agreed with each other and with the
    network log every time, even when the screenshot lagged behind), and MUI's `ToggleButtonGroup`
    needed a full synthetic pointerdown/mousedown/pointerup/mouseup/click sequence rather than a bare
    `.click()` to register in this environment. Neither is a code issue in this ticket's components;
    noted here so a reviewer isn't confused by a stale screenshot if they re-run the same steps.
- **Not done, left for follow-on tickets:** mobile's equivalent history screen (`varavu_selavu_mobile`)
  is unchanged, per the ticket's explicit web-only scope — it has the same "table-mirroring row model"
  gap per `UX_Audit_and_Redesign.md` §3.7 and needs its own ticket. A real "edit split" flow for group
  expenses (see judgment call above) and a real backend `notes` field are also not part of this ticket.

## Scope

Retire both of `ExpensesPage.tsx`'s current scope-conditional rendering paths — the `personal`-scope
MUI `<Table>` and the `groups`/`combined`-scope `<Paper>` + mapped `<Box>` rows — for **one** unified
day-grouped feed component used by all three scopes, matching `ExpenseFeed.jsx`: sticky day headers
with a daily subtotal, rows = category tint dot + merchant/description + category caption + tabular
right-aligned amount, group rows tagged "your share," tap-to-open detail bottom sheet with inline
edit, hover-reveal (web) edit/delete actions.

Per `ORIENTATION_REPORT.md` §2.1, this is a structural rebuild, not a restyle: a `<Table>` has no
structural concept of day-grouping, sticky subtotals, or a tap-to-sheet detail flow, and the existing
non-personal `<Box>`-row path — while closer in spirit — still lacks grouping, tabular-nums, and any
tap/detail interaction. Both paths converge into the new component; neither survives as-is.

**Web only.** `varavu_selavu_mobile`'s equivalent history screen has the same dated "table-mirroring
row model instead of a native day-grouped `SectionList`" gap (`UX_Audit_and_Redesign.md` §3.7), but
it is a different screen under a different name with its own file-touch list — out of scope for this
ticket. Flagging it here so it isn't silently dropped from the initiative; it needs its own ticket
before mobile/web parity is complete for this surface.

## Files it will touch

- `varavu_selavu_ui/src/pages/ExpensesPage.tsx` — remove the `scope === 'personal'` `<Table>` branch
  and the `scope !== 'personal'` `<Box>`-row branch; render all three scopes (`personal`/`groups`/
  `combined`) through the new feed component, keeping the existing `GroupScopeFilter` and
  `AddExpenseForm` dialog wiring.
- **New component(s)** under `varavu_selavu_ui/src/components/expenses/`:
  - `ExpenseFeed.tsx` — day-grouping (sort desc, bucket by date, sticky day-subtotal header),
    row rendering per `ExpenseFeed.jsx`'s reference (tint dot from category, merchant/description,
    category caption or group-badge caption, tabular amount, `◐`/"your share" tag for group rows).
  - `ExpenseDetailSheet.tsx` — tap-to-open detail with inline edit (merchant, category, amount,
    notes) and a delete action; web bottom-sheet/side-panel per Design Spec §5 (`Drawer
    anchor="bottom"` at mobile widths, right-side panel at desktop widths).
  - Hover-reveal edit/delete affordance for desktop pointer input (swipe is mobile-only per Design
    Spec §4.1 — web gets hover-reveal instead, matching the existing precedent of other redesigned
    Groups surfaces in this codebase).
- Category → tint-dot color mapping — reuse or extend whatever category-color mapping already exists
  elsewhere in the app (e.g. category chips/charts) rather than inventing a second one; confirm at
  implementation time whether one already exists before adding a new `categoryColors` table.
- Consumes tokens from `TS-DES-101` (`amount` typography role for tabular-nums, `hairline` for
  dividers, `ink`/`ink-muted` for text, `jade`/`ember` reserved for any directional balance framing
  that might appear on a group row — plain expense amounts stay `ink` per the money-color policy).

## Acceptance criteria

- All three scopes (`personal`, `groups`, `combined`) render through the same feed component — no
  `<Table>` and no bespoke `<Box>`-row path remain in `ExpensesPage.tsx`.
- Rows are grouped by day with a sticky header showing the day label (`TODAY`/`YESTERDAY`/formatted
  date) and that day's subtotal.
- Every rendered amount uses the `amount` typography role (tabular-nums) — no `.toFixed(2)` interpolated
  into a plain `Typography`/string without it.
- Group-scope rows show "my share" as the primary tabular amount with the full/group amount as a
  secondary caption, matching current behavior's intent but through the new row component.
- Tapping a row opens a detail sheet with inline-editable merchant/category/amount/notes and a delete
  action; saving/deleting updates the feed without a full page reload (react-query cache
  invalidation, matching the existing `queryClient.invalidateQueries` pattern already in the file).
- Desktop hover reveals edit/delete actions on a row without requiring the row to be tapped open first.
- No pagination UI (`Load More` button) remains for the personal scope — infinite scroll or
  equivalent continuous loading replaces it, consistent with Design Spec §4.1's "no pagination chrome"
  guidance. (If infinite-scroll wiring is a meaningfully larger lift than fits this ticket, flag it
  explicitly rather than silently keeping the old `Load More` button — this acceptance criterion is a
  target, not a hard gate, if it turns out to need its own follow-up.)
- Visual check against `ExpenseFeed.jsx` side-by-side (or as close as MUI allows) for day-header
  style, row layout, and tint-dot treatment.

## Dependencies

- **TS-DES-101** (tokens must be stable before this ticket's components consume them).

## Test requirements

- Per this redesign track's established approach: no new Jest suites required as a gate for this
  ticket. Verify by running the web app locally (`localhost:3000`), navigating to `/expenses` in
  each scope (personal/groups/combined), and confirming: day grouping renders, tapping a row opens
  the detail sheet, edit/delete work end-to-end, and no console errors appear.
- If existing `ExpensesPage.test.tsx` assertions target the removed `<Table>`/`<Box>`-row DOM
  structure directly, they will need updating to the new component's structure — do not leave them
  red, but do not treat rewriting them as this ticket's primary verification method either.
