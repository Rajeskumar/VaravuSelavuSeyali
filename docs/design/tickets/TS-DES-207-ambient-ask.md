# TS-DES-207 — Ambient Ask: rehost AI Analyst as overlay

**Initiative:** Redesign v2 · **Build order:** 4th (depends on 201, 210) · **Spec:** `Redesign_Proposal_v2.md` §3, `ORIENTATION_REPORT_V2.md` §1 (TS-DES-109 verdict) §3.2 (backend gap), `docs/design/prototypes/v2/Ask.jsx`, `docs/design/prototypes/v2/desktop/DesktopAskOverlay.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Supersedes TS-DES-109. AI Analyst is no longer a nav tab or dedicated page — Proposal v2 §3 moves it
off the nav bar entirely into an ambient, summonable affordance reachable from anywhere. `v2/Ask.jsx`
states this directly: *"Reached from 'Ask' anywhere in the app — not a tab of its own."* This is the
same "chat is a layer, not a room" principle the original Design Spec already argued, followed
through more completely (TS-DES-109 kept a dedicated tab as "the fallback, not the main event"; v2
removes the tab entirely).

**The entry point differs by width, and this ticket owns both:**
- **Mobile:** a summonable sheet (per `v2/Ask.jsx`'s mobile-width behavior).
- **Desktop:** a **header icon** next to the theme toggle and profile avatar — not a floating corner
  button. This is a deliberate resolution of a corner collision `DesktopAskOverlay.jsx` didn't fully
  solve on its own: that prototype file positions its launcher at `bottom: 68` specifically to clear
  a 44px footer, but the live app's existing Add-Expense FAB already claims `bottom: 24, right: 24`
  (`MainLayout.tsx`). Rather than stack two floating buttons in one corner or build a speed-dial, the
  desktop Ask entry point moves into the header row TS-DES-210 establishes, leaving the Add-Expense
  FAB's position completely unchanged.

**"Looked at: ..." chip and Fast/Deep picker survive intact** — confirmed in `v2/Ask.jsx`
(`m.scope` rendered under each assistant message; `MODELS = [Fast, Deep]`) and in
`DesktopAskOverlay.jsx`'s own message rendering. Existing `?q=...` deep-links (from Item/Merchant
Insights' "Ask AI about this item/merchant" cross-links, now living on TS-DES-205's Items/Merchants
tabs) must still auto-submit correctly once resolved against the new overlay/route.

**Backend gaps, unresolved, documented exactly as TS-DES-109 did — not re-litigated or silently
dropped by this rehost:** per `ORIENTATION_REPORT_V2.md` §3.2, there is still no true
free-text→`{period, scope}` resolution behind the "Looked at" chip (the agent answers questions, it
doesn't emit a machine-readable scope side-channel), and still no group-aware chat tool (the
3-tool LangGraph agent — `get_expense_summary`, `get_item_insights`, `get_merchant_insights` — is
unchanged; group-scope questions like `v2/Ask.jsx`'s own starter prompt, "How much do I still owe in
Weekend Trip?", will not resolve correctly against the real backend). Ship the UI now with these
documented as known limitations, same as 109 did — this redesign work doesn't wait on that backend
work.

## Files it will touch

- `varavu_selavu_ui/src/App.tsx` — remove `AI Analyst`'s nav-tab route wiring from primary nav (nav
  array shrink itself is TS-DES-202's job); keep a route (e.g. `/ask`) alive for deep-linking so
  `?q=...` auto-submit links and the overlay's own back-navigation have somewhere to resolve to.
- **New:** `varavu_selavu_ui/src/components/ask/AskOverlay.tsx` — the ambient panel itself, built
  largely from the existing `AIAnalystPage.tsx`'s chat UI (message list, Fast/Deep picker, suggested
  prompts, "Looked at" chip) — component-level logic is reusable per
  `ORIENTATION_REPORT_V2.md` §4; the hosting/entry-point work is what's net-new.
- **New:** desktop header icon entry point — added to whatever header component TS-DES-210
  establishes, next to the theme toggle and `UserMenu` avatar; opens `AskOverlay` as a slide-in panel
  sharing the shell's flex row (per `DesktopAskOverlay.jsx`'s reference layout), not a modal.
- **New:** mobile summonable-sheet entry point, per `v2/Ask.jsx`'s mobile behavior.
- `varavu_selavu_ui/src/pages/AIAnalystPage.tsx` — becomes dead code once nav-tab removal (202) and
  the overlay (this ticket) both land; delete once confirmed no remaining route points at it as a
  primary destination.
- Existing "Ask AI about this item/merchant" cross-link buttons (now on TS-DES-205's Items/Merchants
  tabs) — repoint their `?q=...` deep link target at the new `/ask` route/overlay trigger.

## Acceptance criteria

- No `AI Analyst` entry remains in `navItems.ts` or any nav-rendering surface (verified once
  TS-DES-202 lands; this ticket doesn't re-touch `navItems.ts` itself).
- Desktop: a header icon (not a floating corner button) opens the Ask panel as a slide-in sharing the
  shell's layout; the existing Add-Expense FAB's `bottom: 24, right: 24` position is unchanged and
  unobstructed by the new entry point.
- Mobile: a summonable sheet opens the same chat UI.
- Fast/Deep picker and "Looked at: ..." chip both render and function identically to their current
  `AIAnalystPage.tsx` behavior — confirmed no regression from the rehost.
- Existing `?q=...` deep-links (from Item/Merchant Insights cross-links) still auto-submit correctly
  against the new overlay/route.
- Suggested starter prompts render per `v2/Ask.jsx`'s reference set.
- Documentation (code comment or ticket note, not user-facing UI) states plainly that group-scope
  questions won't resolve correctly against the real backend yet — same disclosure standard 109 set.

## Dependencies

TS-DES-201 (Slate tokens). TS-DES-210 (desktop shell) — `DesktopAskOverlay.jsx` is the concrete
reference for what "ambient" means on desktop specifically (a slide-in panel sharing the shell's flex
row, not a modal), and the header-icon entry point requires TS-DES-210's header to exist first. Can
proceed in parallel with TS-DES-206 (both depend on 210, not on each other).

## Test requirements

- Migrate any existing `AIAnalystPage.test.tsx` assertions to target the new `AskOverlay` component.
- Manual verification: open Ask from the desktop header icon and confirm no visual collision with
  the Add-Expense FAB; open Ask from the mobile summonable sheet; test a `?q=...` deep-link from an
  Items-tab cross-link and confirm it auto-submits; ask a personal-expense question (should resolve
  correctly) and a group-scoped question (documented as not resolving correctly — confirm it fails
  gracefully, not with a crash or a confidently wrong answer presented as authoritative).

## Implementation notes (post-build)

- **No `AIAnalystPage.test.tsx` existed** — checked before starting; there was nothing to migrate.
  `AIAnalystPage.tsx` itself is deleted outright (not left as dead code — confirmed no remaining
  route pointed at it directly once `/ai-analyst` → `/ask` was wired).
- **Route shape ended up as two components sharing one chat component, not one overlay used two
  ways.** `AskOverlay.tsx` (new) is the ambient panel — desktop right-anchored slide-in / mobile
  bottom sheet, triggered by the header icon. `AskPage.tsx` (new, replaces `AIAnalystPage.tsx`
  1:1) is a full-page fallback mounted at `/ask`, for direct navigation — deep links, the
  `?q=...` cross-links, bookmarks, back-navigation. Both wrap the same `AIAnalystChat` component
  TS-DES-109 already built; only the surrounding chrome differs. This matches the ticket's own
  "a route should still exist... so the back-chevron has somewhere to return to" note more
  literally than originally planned — `/ask` isn't a redirect into the overlay, it's a real page.
- **`AIAnalystChat.tsx` got one small, additive change**: a new optional `onClose?: () => void`
  prop, rendered as a close (×) icon in its existing header row next to the Fast/Deep picker, only
  when provided (so `AskPage`'s full-page usage, which doesn't pass it, is unaffected). Also
  renamed the header's visible title from "AI Analyst" to "Ask" to match the new branding — no
  tests existed for this component, confirmed before renaming.
- **Cross-links repointed**: `ItemInsightsPage.tsx` and `MerchantInsightsPage.tsx`'s `askAi()`
  handlers now `navigate('/ask?q=...')` instead of `/ai-analyst?q=...`. Old `/ai-analyst` URLs
  (any stale bookmark) redirect via a small `AiAnalystRedirect` component that reads
  `location.search` and forwards it to `/ask`, so a bookmarked `?q=...` link still auto-submits
  rather than landing on a blank chat.
- **Two real bugs found and fixed during live verification, not caught by `tsc`/Jest:**
  1. **Eager-mount API call.** First pass copied `ModalProps={{ keepMounted: true }}` from
     TS-DES-210's placeholder Drawer into `AskOverlay` without reconsidering it. Since
     `AIAnalystChat` fires a `getModels()` API call on mount, `keepMounted` meant it mounted (and
     called that API, unauthenticated) on **every single page load**, including the public
     homepage — this is what broke `App.test.js` (`scrollIntoView is not a function` in jsdom,
     from an effect that should never have run before the panel was opened). Fixed by dropping
     `keepMounted` (MUI's default lazy-mount is correct here — the conversation resetting on
     close is an acceptable trade-off for an ambient "layer") and gating the whole
     `<AskOverlay>` render on `user`, matching how `RecurringPrompt` was already gated.
  2. **Header collision.** The overlay's own header (title, Fast/Deep picker, close button)
     initially rendered *behind* the app's fixed `AppBar` — `App.tsx` deliberately sets the
     AppBar's `zIndex` to `theme.zIndex.drawer + 1`, so a default-positioned Drawer paper (`top:
     0`) sits underneath it. Only a sliver of the Fast/Deep pill was visible on open. Fixed by
     giving the desktop (`right`-anchor) variant an explicit `top: HEADER_HEIGHT` /
     `height: calc(100% - HEADER_HEIGHT)` (reusing TS-DES-210's shared constant); the mobile
     bottom-sheet variant didn't need this since 85vh from the bottom already clears the header.
- **Mobile entry point was missing entirely in the first pass** — the header icon was gated
  `user && !isMobile`, so mobile had a fully-built bottom-sheet variant with no way to trigger it.
  Fixed by dropping the `!isMobile` condition; the icon now shows at every width (harmless at
  mobile widths — confirmed via the existing mobile header screenshot that there's room next to
  the hamburger/logo/dark-mode/avatar).
- **Backend gaps** (§3.2 — no true intent-resolution behind the "Looked at" chip, no group-aware
  chat tool) are unchanged and not re-litigated here; not independently re-verified this pass
  beyond confirming the chip still renders (it does — see verification below).
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing
  (the `App.test.js` failure from bug #1 above was caught and fixed before this count, not left
  red). Live-verified end-to-end via the running `web-ui` dev server: clicked the desktop header
  icon, confirmed the panel opens correctly positioned below the header with no FAB collision,
  asked "What were my top spending categories?" via a suggested prompt, got a real backend answer
  with a working "Looked at: This month · My Expenses" chip; confirmed the close button works;
  resized to 390px, confirmed the same header icon now opens a bottom sheet instead of a side
  panel; navigated directly to `/ask?q=What did I spend on groceries?`, confirmed `AskPage`
  auto-submitted the query and returned a real answer. Group-scoped question resolution was not
  separately re-tested this pass (unchanged backend, already documented as broken by TS-DES-109).
