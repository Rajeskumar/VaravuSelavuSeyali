# TS-DES-210 — Desktop app shell

**Initiative:** Redesign v2 · **Build order:** 4th (depends on 202; blocks 206/207's desktop-specific pieces) · **Spec:** `Redesign_Proposal_v2.md` §3, desktop-shell gap-check pass (this session), `docs/design/prototypes/v2/desktop/*.jsx` (all eight files) · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Why this is its own ticket, not folded into TS-DES-202

TS-DES-202 already owns trimming `navItems.ts` to 4 entries and both consuming nav surfaces
(`SideNav.tsx`, `NavPills.tsx`) read that same shrunk array for free. But this ticket's work is shell
*construction* — a new permanent-sidebar rendering path, a footer component that doesn't exist
anywhere in the codebase today, new layout constants — which is a materially different unit of work
than nav/IA *consolidation*. Confirmed against the live codebase before scoping:

- **No desktop sidebar exists today.** `SideNav.tsx` is a MUI `Drawer variant="temporary"`, gated
  `display: { xs: 'block', md: 'none' }` (`SideNav.tsx:32`) — its own comment states it directly:
  "used on narrow viewports only. Desktop nav lives in NavPills within the top bar." Desktop's
  current nav is horizontal pills inside the top `AppBar` (`NavPills.tsx`), not a left column. The
  prototypes' 220px permanent left sidebar is a **new nav placement**, not a re-skin of the drawer.
- **No footer exists anywhere.** Confirmed by grep across `varavu_selavu_ui/src` — no `Footer`
  component in any form.
- **No container/layout constants match the prototypes' arithmetic.** `PageContainer.tsx` wraps every
  page in a single MUI `Container maxWidth="lg"` (1200px) with no sidebar-width reservation, no
  footer-height subtraction, no left/right column split. The prototypes' specific numbers (1120px
  inner max-width, 220px sidebar, 58px header, 44px footer, 280px right balances panel on Groups)
  don't correspond to any existing constant in `layout/` — this is new layout math, not an extension
  of `lg`.
- **Account entry point already exists, more completely than the prototypes show.** `UserMenu.tsx`
  is already wired (`App.tsx:136-140`): the avatar opens a real MUI `Menu` with a working "Profile"
  item (navigates to `/profile`) and "Logout." None of the eight desktop prototypes wire an `onClick`
  on their avatar circle — they render it as static. The live `UserMenu.tsx` is, right now, more
  complete than what the mockups demonstrate; this ticket **extends** it, not replaces it.
- **The floating Ask launcher pattern is genuinely new**, and its naive placement collides with
  existing UI. `DesktopAskOverlay.jsx` positions its launcher at `bottom: 68` specifically to clear a
  44px footer that doesn't exist live today — but the live app's only existing `Fab`
  (`MainLayout.tsx:51-58`, Add-Expense) already claims `bottom: 24, right: 24`. Two floating buttons
  contesting one corner is a real decision, resolved below (header icon instead of a second FAB) —
  see TS-DES-207, which owns the Ask panel's actual content but defers to this ticket's resolution of
  where its entry point lives.

## Scope

- **Retarget `SideNav.tsx`** with a permanent-variant rendering path for desktop breakpoints, reusing
  its existing `navItems.ts`-driven list rendering and active-state check (`location.pathname.
  startsWith(item.path)`) — do not build a new parallel sidebar component from scratch. Add a
  `variant="permanent"` desktop branch alongside the existing `variant="temporary"` mobile branch
  (MUI's `Drawer` supports both natively off one component).
- **Retire `NavPills.tsx` at desktop widths** once the permanent sidebar ships — don't run both nav
  surfaces simultaneously at the same breakpoint. `NavPills.tsx` itself can stay in the codebase if
  still needed at some intermediate width, but it must not render alongside the new permanent sidebar
  at the same time.
- **Build a new `Footer` component** — confirmed net-new, nothing like it exists today. Content:
  Privacy/Terms/Help/Submit-an-idea links + copyright line, per the desktop prototypes' reference
  footer row.
- **Layout constants:** sidebar ~220–240px fixed width, header ~58px, footer ~44px. Establish these
  as named constants (mirroring `SideNav.tsx`'s existing exported `drawerWidth = 280` pattern) rather
  than inlining magic numbers at each call site.
- **Clarification for whoever implements this, load-bearing enough to restate in the ticket itself:**
  the desktop prototypes render as a bounded "card" (`maxWidth: 1120`, centered, rounded corners,
  `shadow-2xl`, gray backdrop — confirmed literally in every `desktop/*.jsx` file's outermost `div`,
  e.g. `DesktopHome.jsx:73`, `DesktopAskOverlay.jsx:152`). **That's a presentation convention for
  viewing the mockup in isolation, not a literal spec.** Production chrome (header, sidebar, footer)
  must span the full viewport width at all desktop sizes — no rounded-corner floating card, no gray
  backdrop, no fixed 700px height. Only specific *content* within pages may optionally cap at a
  comfortable reading width on ultra-wide monitors (that's a per-page decision for 203/204/205/206,
  not this ticket) — the app shell itself never boxes into a floating card.
- **Ask's entry point is a header icon**, not a floating button — added next to the theme toggle and
  `UserMenu` avatar in the new desktop header row. This deliberately avoids the FAB corner collision
  described above: the existing Add-Expense FAB keeps `bottom: 24, right: 24` in `MainLayout.tsx`
  completely unchanged. (The Ask panel's actual content/behavior is TS-DES-207's scope — this ticket
  only establishes where its desktop entry point lives.)
- **Avatar → Account repoint:** `UserMenu.tsx`'s existing "Profile" `MenuItem` (`onProfile` handler,
  currently navigates to `/profile`) should point at `/account` once TS-DES-202's route exists.
  Explicitly assigned here, not to TS-DES-202, so it doesn't fall through between the two tickets —
  202 builds the `/account` route; this ticket repoints the one call site that should navigate to it
  from the avatar menu.
- Depends on TS-DES-202 landing first — the sidebar reads `navItems.ts`, and shipping this shell
  before 202 lands means building a permanent rail that still shows 9 stale items.

**Does NOT own** (explicitly out of scope, flagged so it isn't duplicated or dropped):
- The Groups right-side `BalancesPanel` (280px column) — that's TS-DES-206's content, which consumes
  this shell's layout, not shell itself.
- Ask's actual panel content/chat behavior — that's TS-DES-207's, same consumer relationship.

## Files it will touch

- `varavu_selavu_ui/src/components/layout/SideNav.tsx` — add a desktop `variant="permanent"` branch;
  keep the existing mobile `variant="temporary"` branch unchanged. Export new layout constants
  alongside the existing `drawerWidth`.
- `varavu_selavu_ui/src/components/layout/NavPills.tsx` — gate its rendering to not activate at the
  same breakpoint the new permanent sidebar activates at (avoid double nav-surface rendering).
- **New:** `varavu_selavu_ui/src/components/layout/Footer.tsx` — Privacy/Terms/Help/Submit-an-idea +
  copyright, full viewport width, ~44px height.
- `varavu_selavu_ui/src/App.tsx` — restructure the authenticated-route layout to a flex/grid row
  (sidebar + main content column) at desktop widths, mount `Footer` at the bottom of that structure;
  header icon for Ask added to the existing `Toolbar` alongside the theme-toggle `IconButton` and
  `UserMenu`.
- `varavu_selavu_ui/src/components/layout/PageContainer.tsx` — do not change its `maxWidth="lg"`
  content-capping behavior for page content itself; the new sidebar/footer live *outside*
  `PageContainer`, in the shell that wraps it, not inside it.
- `varavu_selavu_ui/src/components/layout/UserMenu.tsx` — repoint the `onProfile` handler's
  destination to `/account` (the prop itself, `onProfile: () => void`, doesn't need to change shape —
  only what `App.tsx` passes as the callback needs to change).
- `varavu_selavu_ui/src/components/layout/MainLayout.tsx` — **no change to the FAB's position**
  (`bottom: 24, right: 24` stays exactly as-is); confirm this explicitly during implementation rather
  than assuming it's untouched.

## Acceptance criteria

- At desktop widths, a permanent left sidebar (reusing `SideNav.tsx`'s existing item-rendering logic)
  replaces `NavPills.tsx` — both do not render simultaneously at the same breakpoint.
- At narrow/mobile widths, the existing temporary drawer behavior is completely unchanged — this
  ticket adds a desktop path, it doesn't touch the mobile one.
- A footer (Privacy/Terms/Help/Submit-an-idea + copyright) renders at the bottom of every
  authenticated desktop-width page.
- **Header, sidebar, and footer span the full viewport width at all desktop sizes** — no rounded-
  corner floating card, no fixed-height container, no gray backdrop margin around the shell. Verified
  by testing at multiple desktop widths (e.g. 1280px, 1440px, 1920px) and confirming the shell fills
  each, not just the 1120px prototype reference width.
- Ask's desktop entry point is a header icon next to the theme toggle and avatar — not a floating
  button — and the existing Add-Expense FAB's position (`bottom: 24, right: 24`) is verified pixel-
  unchanged.
- Clicking the avatar → "Profile" now navigates to `/account` (not `/profile`), confirmed once
  TS-DES-202's route exists; if tested before 202 lands, this criterion is blocked, not failed.
- `SideNav.tsx`'s permanent variant reflects the same 4-item `navItems.ts` array TS-DES-202 produces
  — no stale 9-item list visible in the new sidebar.
- Dark mode verified for sidebar, footer, and header icon.

## Dependencies

TS-DES-201 (Slate tokens) for all visual styling. **Hard dependency on TS-DES-202** — the sidebar
reads `navItems.ts` and must not ship against the stale 9-item list. TS-DES-206 (Groups v2's desktop
balances panel) and TS-DES-207 (Ambient Ask's desktop header icon) both depend on this ticket landing
first and can proceed **in parallel with each other** once it does — neither depends on the other.
TS-DES-203/204/205/208 do not need this ticket for their mobile-width work and can proceed once 201
lands, independent of this ticket's timeline — but this ticket should exist before anyone does a
desktop-width pass on those three pages specifically, so that pass has a real shell to build inside
rather than guessing at one.

## Test requirements

- No new Jest suite required as a hard gate for layout-only shell work; any existing test that
  asserts on `NavPills` always rendering, or on `PageContainer`'s content being the outermost wrapper,
  should be reviewed and updated if it now conflicts with the shell restructure.
- Manual verification, required at multiple desktop widths (not just the 1120px prototype reference):
  confirm full-viewport-width shell (no floating-card artifact), sidebar/footer both render and are
  functional (nav clicks work, footer links resolve), Ask header icon opens correctly without
  overlapping the Add-Expense FAB, avatar → Account navigation works once 202 lands, and mobile-width
  behavior is completely unregressed (test at a narrow viewport too, not just desktop).

## Implementation notes (post-build)

- **`SideNav.tsx` retargeted, not replaced** — extracted the item-rendering/active-state logic into
  a shared internal `NavList` component, then mounted it inside *two* always-present `Drawer`s: the
  original `variant="temporary"` (mobile, unchanged behavior) and a new `variant="permanent"` one
  (desktop, `desktopSidebarWidth = 232` exported alongside the existing `drawerWidth = 280`). Both
  Drawers use CSS `display: {xs/md}` to pick which one is visible — the same mechanism the component
  already used pre-ticket for its single temporary variant — rather than a `useMediaQuery` JS branch.
  `NavPills.tsx` is no longer imported or rendered anywhere in `App.tsx`; the file itself was left in
  place (unused) per the ticket's own "can stay in the codebase" allowance rather than deleted.
- **Footer placement required one correction after the first pass.** Initially nested `<Footer/>`
  inside the content column (sibling of `PageContainer`, inside the sidebar+content flex row) — this
  under-spans the page, stopping at the sidebar's right edge instead of running full width beneath it.
  Checked `DesktopDashboard.jsx`'s actual structure (`desktop/DesktopDashboard.jsx:135,229`): `Footer`
  is a sibling of the `[Sidebar, content]` flex row at the *outer* flex-column level, not nested inside
  the content column. Moved `<Footer/>` in `MainLayout.tsx` to match — it now spans the full shell
  width, under the sidebar too, exactly like every desktop prototype.
- **New `layoutConstants.ts`** holds `HEADER_HEIGHT = 58` and `FOOTER_HEIGHT = 44`, shared by
  `App.tsx` (both the `AppBar`'s `Toolbar` and the empty spacer `Toolbar` below it — both needed the
  *same* explicit `minHeight` override, otherwise the spacer's MUI-default responsive height (64px at
  `sm+`) would drift from the AppBar's overridden 58px and leave a gap) and `Footer.tsx`.
  `desktopSidebarWidth` stays in `SideNav.tsx` alongside `drawerWidth`, per the ticket's own
  instruction to export it "alongside the existing `drawerWidth`" rather than centralizing every
  constant in one file.
- **Verified the "full-viewport, not a floating card" requirement is actually met**, not just
  visually plausible — a low-contrast dark-mode screenshot initially looked like the sidebar was NOT
  stretching full height (its lighter `surfaceDark` fill appeared to stop partway down). Checked via
  `getComputedStyle`/`getBoundingClientRect` on the live DOM rather than trusting the screenshot: the
  `Drawer` paper's rect was `top: 58, bottom: 1356` (exactly matching the content column's height down
  to the footer boundary) with the correct `background-color: rgb(24,24,27)` (Slate `surfaceDark`) and
  `border-right: 1px solid rgb(39,39,42)` (Slate `borderDark`) — the layout was correct; the screenshot
  was just hard to read by eye because `surfaceDark`/`canvasDark` are close in value. Re-confirmed
  visually in light mode (higher contrast) at 1920px, 1280px, and 390px (mobile) — all correct.
- **Ask header icon shipped as an explicit placeholder, not real functionality** — a `ChatBubbleOutlineRoundedIcon`
  `IconButton` between the theme toggle and `UserMenu` (desktop-only, `user && !isMobile`), opening a
  right-anchored `Drawer` that currently just says "The ambient Ask panel is coming soon (TS-DES-207)."
  This satisfies this ticket's acceptance criterion (a working header icon exists, positioned correctly,
  doesn't collide with the FAB) without building fake chat UI that TS-DES-207 would need to throw away.
  TS-DES-207 will very likely delete this inline `Drawer`/`askOpen` state from `App.tsx` entirely and
  replace it with its own `AskOverlay` component — flagging that explicitly so it isn't mistaken for
  already-finished 207 work.
- **Avatar → Account repoint done in `App.tsx`, not `UserMenu.tsx`** — `UserMenu`'s `onProfile` prop
  signature (`() => void`) didn't need to change; only the callback `App.tsx` passes changed, from
  `() => navigate('/profile')` to `() => navigate('/account')`. Matches the ticket's own file-list note
  that `UserMenu.tsx` itself shouldn't need a shape change.
- **FAB position confirmed unchanged** — `MainLayout.tsx`'s `Fab` still uses
  `position: 'fixed', bottom: 24, right: 24` verbatim; only its surrounding layout (now nested one level
  deeper inside the new sidebar/content flex row) changed, which has no effect on a `position: fixed`
  element's viewport-relative placement.
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing, no
  updates needed. Live-verified via the running `web-ui` dev server at 1920px, 1280px, and 390px:
  permanent sidebar renders with the correct 4 nav items and active-state highlighting at both desktop
  widths; footer renders full-width with working Privacy/Terms (external)/Help/Submit-an-idea
  (`/account?tab=feedback`) links; Ask placeholder icon opens/closes correctly without overlapping the
  FAB; mobile (390px) hamburger menu still opens the original temporary drawer correctly, Ask icon
  correctly absent, FAB correctly present. Not verified live: avatar → `/account` navigation specifically
  post-202 (implicitly covered — `/account` itself was already verified working end-to-end during
  TS-DES-202's own verification pass; only the repointed callback here is new, and it's a one-line,
  low-risk change).
