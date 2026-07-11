# TS-DES-204 — Expenses v2: feed rebuild + Recurring sub-tab

**Initiative:** Redesign v2 · **Build order:** 3rd (depends on 201; independent of 202/210) · **Spec:** `Redesign_Proposal_v2.md` §1 (palette only; feed pattern itself unchanged from v1), `ORIENTATION_REPORT_V2.md` §1 (TS-DES-102/110 verdicts) §2 (routing), `docs/design/prototypes/v2/Expenses.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Supersedes TS-DES-102's and TS-DES-110's component scope. The day-grouped feed pattern itself
(sticky day headers, tint-dot rows, swipe-to-reveal edit/delete, tap→detail sheet) is unchanged from
102's original scope, confirmed live in `v2/Expenses.jsx`'s `ExpenseRow`/`ExpenseDetailSheet` — only
the palette changes there (Slate, via TS-DES-201). The structural addition this ticket owns: **a
`SubTabBar` host (`Transactions` / `Recurring`)** — Recurring is no longer a peer nav destination
(cut from `navItems.ts` by TS-DES-202), it's a sub-tab inside this page. `v2/Expenses.jsx`'s
`RecurringTab` preserves TS-DES-110's card-per-template pattern (`RecurringCard`, pause/resume
toggle, due/paused pill) almost exactly, plus gains a "Run now" affordance not in 110's original
scope.

This ticket owns the `/expenses?tab=recurring` redirect **target** (i.e., making that URL actually
render the Recurring sub-tab) — TS-DES-202 owns the redirect **source** (`/recurring` →
`/expenses?tab=recurring`), landing before or alongside this ticket per the fallback note in 202's
own scope.

## Files it will touch

- `varavu_selavu_ui/src/pages/ExpensesPage.tsx` — add a `SubTabBar` (`Transactions`/`Recurring`)
  reading/writing a `?tab=` query param; existing feed content becomes the `Transactions` tab's
  content, unchanged in behavior.
- **New:** `varavu_selavu_ui/src/components/expenses/RecurringTab.tsx` — hosts the card-per-template
  list, migrated from the standalone `RecurringPage.tsx` (TS-DES-110's original page). `RecurringCard`
  (pause/resume toggle, due/paused pill, new "Run now" action) moves here largely as-is per
  `v2/Expenses.jsx`'s reference implementation.
- `varavu_selavu_ui/src/pages/RecurringPage.tsx` — becomes dead code once the redirect (TS-DES-202)
  and this sub-tab both land; delete once confirmed no remaining route points at it directly (leave
  in place until then rather than deleting speculatively).
- `varavu_selavu_ui/src/App.tsx` — `/recurring` route disposition is TS-DES-202's redirect, not
  edited again here; this ticket only needs `/expenses?tab=recurring` to resolve correctly.

## Acceptance criteria

- `ExpensesPage` shows a `Transactions`/`Recurring` sub-tab bar; `Transactions` is the default,
  matching current behavior for anyone landing on bare `/expenses`.
- `Recurring` tab shows the same card-per-template content TS-DES-110 already specified, plus the
  new "Run now" action, at the Slate palette (via TS-DES-201).
- `/expenses?tab=recurring` deep-links directly into the Recurring tab (needed for TS-DES-202's
  redirect target to actually work, and for any bookmark of the old `/recurring` URL to land
  correctly post-redirect).
- Day-grouped feed (Transactions tab) behavior — sticky headers, swipe-to-reveal, detail sheet —
  is unchanged from its current live behavior; this ticket doesn't regress feed functionality while
  adding the tab host around it.
- Pause/resume toggle and "Run now" both work against the existing recurring-template endpoints (no
  new backend work required — confirmed `RecurringTemplate` CRUD + due/confirm/execute_now already
  exist per `FEATURE_STATUS.md`).

## Dependencies

TS-DES-201 (Slate tokens). Independent of TS-DES-202/210 for its own structural work, but its
`?tab=recurring` deep-link target should exist before or alongside TS-DES-202's redirect ships, so
the redirect doesn't land users on a 404 or an unfinished tab in the interim.

## Test requirements

- Existing `ExpensesPage` and `RecurringPage` tests: migrate assertions that exercise recurring-card
  behavior to target the new `RecurringTab` component instead of the standalone page, rather than
  leaving them asserting against dead code.
- Manual verification: switch between Transactions/Recurring tabs, confirm feed and recurring-card
  behavior both work exactly as before at the new tab location, confirm `/expenses?tab=recurring`
  deep-links correctly, and confirm "Run now" actually triggers `execute_now` against a live
  template.

## Implementation notes (post-build)

- **No `RecurringPage.test.tsx` existed** — checked before starting; nothing to migrate.
  `RecurringPage.tsx` deleted outright (not left as dead code) once its content moved to the new
  `RecurringTab.tsx` and the `/recurring` route became a redirect.
- **"Run now" was already built, not new to this ticket** — confirmed in `RecurringCard.tsx`
  before starting: the pause/resume toggle and "Run now" affordance (with a "Logged" confirmation
  state) both already existed in the live component. This ticket's own scope description assumed
  "Run now" was net-new (matching the prototype's framing vs. TS-DES-110's original scope); it
  turned out to already be live. `RecurringTab.tsx` reuses `RecurringCard` unchanged.
- **`SubTabBar` reused the existing generic `SegmentedTabs` component** (the same one
  `TrueTotalHero`, `GroupDetailPage`, and `AccountPage` already use) rather than building a new
  tab-bar component — matching the pattern already established for TS-DES-202's `AccountPage`.
  `?tab=` query param via `useSearchParams`, mirroring `AccountPage.tsx`'s exact approach
  (`transactions` is the default/no-param state, `?tab=recurring` for the other tab).
- **Header actions are tab-conditional**: the `GroupScopeFilter` (Personal/Groups/Combined) and
  "Add Expense" button only render on the Transactions tab — `RecurringTab` has its own "Add"
  button (adds a recurring template, a different action), so showing both would have put two
  differently-scoped "Add" buttons in the header simultaneously.
- **`/recurring` → `/expenses?tab=recurring` redirect completes what TS-DES-202 deliberately
  deferred.** TS-DES-202's own implementation notes explicitly left `/recurring` live and
  un-redirected because this ticket's sub-tab host didn't exist yet — landing a lossy redirect
  before the destination existed would have been worse than leaving the old page reachable. That
  gap is now closed.
- **One pre-existing test gap found and fixed, not introduced by this change**:
  `ExpensesPage.test.tsx`'s `renderPage()` helper never wrapped `<ExpensesPage/>` in a
  `<MemoryRouter>` — harmless before this ticket, since the old `ExpensesPage` used no
  router hooks at all. Adding `useSearchParams` (needed for the new `?tab=` state) exposed this:
  `useSearchParams` throws outside a Router context, failing 4 of the file's tests with
  `useLocation() may be used only in the context of a <Router>`. Fixed by wrapping in
  `<MemoryRouter>`, matching the pattern `GroupsPage.test.tsx` already used.
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing
  (after the `MemoryRouter` fix above). Verified live via the running `web-ui` dev server: the
  `Transactions`/`Recurring` `SubTabBar` renders and switches correctly; the Transactions tab's
  day-grouped feed, hover-reveal edit/delete, and scope filter are all unchanged from before this
  ticket; the Recurring tab shows the existing template ("Netflix Subscription, $15.99/mo, Due Aug
  9") with working pause/resume toggle and "Run now" button; clicking the tab updates the URL to
  `/expenses?tab=recurring`; navigating directly to `/recurring` correctly redirects to
  `/expenses?tab=recurring`. "Run now" was not re-exercised against a live template this pass
  (already covered by `RecurringCard`'s own prior verification, unchanged by this ticket's move).
