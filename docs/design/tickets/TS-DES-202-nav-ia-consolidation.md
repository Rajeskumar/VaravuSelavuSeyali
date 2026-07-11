# TS-DES-202 — Nav/IA consolidation: 4-item nav, `/account` route, redirect shims

**Initiative:** Redesign v2 · **Build order:** 2nd (depends on 201 only) · **Spec:** `Redesign_Proposal_v2.md` §3, `ORIENTATION_REPORT_V2.md` §2, `docs/design/prototypes/v2/Account.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Shrink `navItems.ts` from 9 destinations to 4 (`Dashboard, Expenses, Analysis, Groups`), fold the
five destinations that fall out of primary nav into either `/account` (new) or a sub-tab of an
existing page (owned by TS-DES-204/205, not this ticket — this ticket only owns the **redirect**,
not the destination page's content), and ship redirect shims so no existing bookmark or deep link
breaks. This ticket owns the full routing table in `ORIENTATION_REPORT_V2.md` §2 — cutting it as one
ticket (rather than five page tickets each inventing their own redirect convention) is deliberate.

Current state, confirmed live: `navItems.ts` has 9 entries (`Dashboard, Expenses, Groups, Analysis,
Item Insights, Merchant Insights, AI Analyst, Recurring, Submit Idea`); `SideNav.tsx` (mobile-only
temporary drawer, `display: { xs: 'block', md: 'none' }`) and `NavPills.tsx` (desktop, horizontal
pills in the top `AppBar`) both render directly off this same array, so shrinking the array updates
both surfaces for free — no separate mobile/desktop nav-item change needed here (desktop's *chrome*
change, permanent sidebar replacing `NavPills`, is TS-DES-210's scope, not this ticket's).

## Files it will touch

- `varavu_selavu_ui/src/components/layout/navItems.ts` — reduce to 4 entries: `Dashboard, Expenses,
  Analysis, Groups`. Remove `Item Insights`, `Merchant Insights`, `AI Analyst`, `Recurring`,
  `Submit Idea` as nav-visible entries (their routes are not deleted — see redirect table below).
- **New:** `varavu_selavu_ui/src/pages/AccountPage.tsx` — hosts `Profile`/`Feedback` via a
  `SegmentedTabs`-equivalent pattern, per `v2/Account.jsx`. `Profile` is the default/first tab.
  Reuses the existing `ProfilePage.tsx` and `FeatureRequestPage.tsx` content as the two tab panes
  rather than rewriting either from scratch — this ticket is a routing/hosting change, not a
  redesign of either page's internals (those are out of the 2xx scope unless separately ticketed).
- `varavu_selavu_ui/src/App.tsx` — add the `/account` route (`AccountPage`, wrapped in
  `MainLayout`/`RequireAuth` like every other authenticated route, `App.tsx:163-172`'s pattern);
  add client-side redirects (`<Navigate replace>` or equivalent) for the five routes below.
- Redirect table (old route → new target), per `ORIENTATION_REPORT_V2.md` §2:
  - `/item-insights` → `/analysis?tab=items` (preserve any `?item=<id>` query param on redirect —
    the existing "Ask AI about this item" cross-link depends on this still resolving)
  - `/merchant-insights` → `/analysis?tab=merchants` (preserve `?merchant=<id>` the same way)
  - `/recurring` → `/expenses?tab=recurring`
  - `/feature-request` → `/account?tab=feedback`
  - `/profile` → `/account` (Profile is the default tab, no `?tab=` needed)
  - Note: the redirect *targets* above (`/analysis?tab=items`, `/expenses?tab=recurring`) only
    resolve correctly once TS-DES-204/205 land their sub-tab hosts — until then, redirect to the
    nearest currently-valid destination (i.e., the still-live `/analysis` or `/expenses` page) so a
    bookmark doesn't 404 in the gap between this ticket and 204/205 shipping.
- `varavu_selavu_ui/src/components/layout/UserMenu.tsx` — **not touched by this ticket.** Its
  "Profile" `MenuItem` repoint to `/account` is explicitly assigned to TS-DES-210 (see that ticket's
  scope note) so it doesn't fall through between the two — flagging here so nobody assumes it's
  covered by 202 just because 202 owns the route it points to.

## Acceptance criteria

- `navItems.ts` has exactly 4 entries, in order: `Dashboard, Expenses, Analysis, Groups`.
- `/account` renders `Profile` (default) and `Feedback` tabs, each showing the same content the old
  `/profile` and `/feature-request` pages showed (content unchanged, only the host/route changed).
- All five old routes (`/item-insights`, `/merchant-insights`, `/recurring`, `/feature-request`,
  `/profile`) still resolve to *something* — either their new consolidated destination or, until
  204/205 land, a safe fallback — never a 404 or blank page.
- Query-param deep links (`/item-insights?item=123`, `/merchant-insights?merchant=456`) preserve
  their id param through the redirect.
- Both `SideNav.tsx` (mobile drawer) and `NavPills.tsx` (current desktop pills, pending TS-DES-210's
  replacement) render only the 4 remaining items — confirmed visually on both a narrow and a desktop
  viewport.
- No broken internal cross-links: grep the codebase for every `navigate('/item-insights'`,
  `navigate('/recurring'`, etc. call site (chat deep-links, "Ask AI about this item/merchant"
  buttons, any due-prompt links) and confirm each still lands somewhere sensible post-redirect.

## Dependencies

TS-DES-201 (Slate tokens) — soft dependency; this ticket's own work (routing, not visuals) doesn't
strictly need Slate to be correct, but per the established sequencing rule, land 201 first so this
doesn't need a second pass once tokens move. TS-DES-210 (desktop shell) and TS-DES-206 (Groups v2)
both depend on this ticket landing first — the desktop sidebar and any nav-reading component would
otherwise render with 9 stale items.

## Test requirements

- No new Jest suite required as a hard gate; existing route/nav tests that assert on `navItems`
  length or specific old entries must be updated, not left red.
- Manual verification: click through all 4 remaining nav items on both a narrow and desktop
  viewport; visit each of the 5 old routes directly (including with query params) and confirm the
  redirect lands correctly; confirm `/account` tab switching works and shows the right content in
  each tab.

## Implementation notes (post-build)

- **Scope actually shipped this pass: `navItems.ts` shrink, `/account` route + `AccountPage.tsx`,
  and the `/profile` redirect.** `/item-insights`, `/merchant-insights`, and `/recurring` were
  deliberately **not** redirected yet — their consolidated destinations (`/analysis?tab=items`,
  `/analysis?tab=merchants`, `/expenses?tab=recurring`) don't exist until TS-DES-204/205 land. Per
  this ticket's own scope note ("until then, redirect to the nearest currently-valid destination"),
  the correct fallback for those three right now *is* their current, still-fully-functional
  standalone page — redirecting them to a lossy destination (e.g. bare `/analysis`, dropping the
  `?item=`/`?merchant=` id) would have actively broken existing deep links for no benefit. All three
  routes are simply left live and unchanged; they're only removed from the nav array (which is what
  actually happened — `ItemInsightsPage`/`MerchantInsightsPage`/`RecurringPage` are all still fully
  reachable by direct URL, still fully functional, just no longer nav-visible). TS-DES-204/205 own
  adding the real redirects once their sub-tab hosts exist to redirect *to*.
- **`/feature-request` was NOT redirected** — a real conflict found during implementation, not
  anticipated in the ticket's original routing table. `HomePage.tsx:324`'s public marketing footer
  links to `/feature-request` for **unauthenticated** visitors. The ticket's redirect target
  (`/account?tab=feedback`) sits behind `RequireAuth`, which would have silently turned a public,
  no-friction feedback link into a forced login redirect for anonymous visitors — a real regression,
  not a routing nicety. Resolved by keeping `/feature-request` as a public standalone route
  (still rendering `FeatureRequestPage` directly, unchanged) **and** wiring `/account`'s Feedback tab
  to the same `FeatureRequestPage` component for the authenticated, nav-driven path. Both routes
  render the identical component, so there's no duplicated logic to keep in sync — just two entry
  points into the same form, which was in the codebase before this ticket touched it. Flagging this
  since the original redirect table (in this ticket and in `ORIENTATION_REPORT_V2.md` §2) assumed
  `/feature-request` was purely a nav-gated, authenticated destination, which turned out not to be
  true.
- **`AccountPage.tsx`** hosts `ProfilePage`/`FeatureRequestPage` unmodified as tab panes inside a
  `SegmentedTabs<'profile' | 'feedback'>` control (reused from `components/common/SegmentedTabs.tsx`,
  the same component `TrueTotalHero` already uses — no new tab-control component built). Tab state
  reads/writes the `?tab=` query param via `useSearchParams` (`profile` is the default/no-param
  state, `?tab=feedback` for the other tab), matching the redirect shape the ticket specified.
- **Avatar → Account repoint confirmed NOT done here** — `App.tsx`'s `UserMenu onProfile` handler
  still calls `navigate('/profile')`, unchanged, exactly as this ticket's own scope said (explicitly
  assigned to TS-DES-210). It still works correctly today only because `/profile` redirects to
  `/account` — so clicking the avatar menu's "Profile" item currently does two navigations
  (`/profile` → `/account`) until TS-DES-210 repoints it directly to `/account`.
- **Unused imports cleaned up in `App.tsx`**: `ProfilePage` import removed (only used via
  `AccountPage` now, no longer referenced directly in `App.tsx`); `FeatureRequestPage` import kept
  (still used directly for the public route, per the conflict resolved above).
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing, no
  updates needed (no existing test asserted on `navItems`'s length or the old 9-item list). Verified
  live via the running `web-ui` dev server: nav bar shows exactly `Dashboard / Expenses / Analysis /
  Groups`; visiting `/profile` redirects to `/account` and loads real profile data (name/phone
  correctly populated from the API); clicking the Feedback tab updates the URL to
  `/account?tab=feedback` and renders the "Submit an Idea" form correctly; dark mode confirmed
  correct on both tabs. Not verified live this pass: `/item-insights`, `/merchant-insights`,
  `/recurring` were not re-tested since they're intentionally unchanged (already covered by prior
  sessions / TS-DES-107/108/110's own verification).
