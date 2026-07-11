# TS-DES-206 — Groups v2: avatar-forward revamp

**Initiative:** Redesign v2 · **Build order:** 4th (depends on 201, 210 for the desktop balances panel specifically) · **Spec:** `Redesign_Proposal_v2.md` §7, `ORIENTATION_REPORT_V2.md` §1 (TS-DES-104 verdict), `docs/design/prototypes/v2/Groups.jsx`, `docs/design/prototypes/v2/desktop/DesktopGroupLayout.jsx`, `DesktopGroupsList.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Supersedes TS-DES-104. 104's "restyle already-built UI onto tokens + add settle-up hero/count-to-zero"
scope is real and still needed (retarget to Slate via TS-DES-201) but Proposal v2 §7 asks for
materially more — this is a second structural pass on the Groups surface, not a retoken, with
Splitwise named explicitly as the reference point:

- **Avatar-forward member rows as the primary visual anchor** — overlapping avatar stacks, larger,
  colored per person. Confirmed in `v2/Groups.jsx`'s `AvatarStack`/`Avatar` components; this is a
  bigger visual language shift than "restyle onto new hex values."
- **Net balance as large standalone type, no card border** — not boxed inside a bordered surface the
  way the current implementation renders it.
- **Swipe/hover actions on group expense rows** — swipe on mobile widths, hover-revealed actions on
  desktop widths (the desktop-specific interaction pattern is new relative to 104's original scope).
- **Softer elevation throughout** — consistent with the hairline-over-shadow policy TS-DES-101/201
  already established, applied more thoroughly to Groups' own surfaces than 104 originally scoped.

**Desktop-specific content, depends on TS-DES-210:** the right-side `BalancesPanel` in
`DesktopGroupLayout.jsx` (confirmed, 280px fixed-width column, `borderLeft`) is Groups-page content
that *consumes* the app shell TS-DES-210 builds — it is not shell itself, so it's scoped here, not
in 210. This is the one piece of this ticket that has a hard dependency on 210 landing first; the
mobile/narrow-width member-row and balance-typography work does not need the shell and can proceed
once 201 lands, independent of 210's timeline.

## Files it will touch

- `varavu_selavu_ui/src/pages/GroupsPage.tsx`, `GroupDetailPage.tsx` — restyle onto Slate; rebuild
  member-row rendering around `AvatarStack` as the primary visual element (currently, confirm at
  implementation time exactly how member rows render today before assuming a specific starting
  shape).
- `varavu_selavu_ui/src/components/groups/` — new or heavily revised `AvatarStack.tsx`/`Avatar.tsx`
  (overlapping stack, per-person color), a standalone (no-card-border) net-balance display component,
  and swipe (mobile)/hover (desktop) row-action wiring for group expense rows.
- **Desktop-only, gated on TS-DES-210:** new `BalancesPanel.tsx` — 280px fixed-width right column
  inside the desktop group-detail layout, per `DesktopGroupLayout.jsx`'s reference implementation.
  This component mounts inside whatever flex/grid row TS-DES-210's shell establishes — it does not
  define its own page-level layout scaffolding.
- Settle-up hero / count-to-zero — carried forward from TS-DES-104's original scope, restyled onto
  Slate, otherwise unchanged in behavior.

## Acceptance criteria

- Member rows render with overlapping, per-person-colored avatar stacks as the primary visual
  element, matching `v2/Groups.jsx`'s `AvatarStack` pattern.
- Net balance renders as large standalone type with no surrounding card border, at both mobile and
  desktop widths.
- Group expense rows support swipe actions at mobile widths and hover-revealed actions at desktop
  widths (confirm the desktop hover pattern only activates above the same breakpoint TS-DES-210 uses
  for its permanent-sidebar cutover, so the two don't disagree on what counts as "desktop").
- Settle-up hero / count-to-zero animation still works, restyled onto Slate tokens.
- **Desktop only:** the right-side `BalancesPanel` renders at a fixed ~280px width inside the group
  detail layout once TS-DES-210's shell exists; does not render (or gracefully collapses) at
  narrower widths where the desktop shell isn't active.
- Dark mode verified throughout, including the new avatar-stack coloring (per-person colors need a
  legible dark-mode variant, not just a straight hex reuse).

## Dependencies

TS-DES-201 (Slate tokens) for all of it. TS-DES-210 (desktop shell) specifically for the
`BalancesPanel` — the rest of this ticket's scope (avatar stacks, standalone balance type, mobile
swipe actions, settle-up restyle) is independent of 210 and can land before it if sequencing pressure
requires; only the desktop balances-panel piece needs to wait.

## Test requirements

- Existing `GroupsPage`/`GroupDetailPage` tests: update any assertion that checks for the old
  bordered-balance-card DOM shape, since that shape is being deliberately removed.
- Manual verification: confirm avatar stacks render correctly with 2, 5, and 10+ members (overlap/
  overflow behavior at high member counts, since `v2/Groups.jsx`'s reference may not demonstrate
  that case); confirm swipe actions on mobile and hover actions on desktop each work; confirm the
  desktop `BalancesPanel` renders correctly once TS-DES-210 is available to test against; confirm
  settle-up count-to-zero still animates correctly post-restyle.

## Implementation notes (post-build)

- **`GroupSummary` (the Groups **list** endpoint) doesn't carry member data** — confirmed via
  `api/groups.ts`: it has `member_count` (a number) only, no member ids/names, unlike
  `GroupDetailResponse.members: MemberDTO[]` (a different endpoint, already fetched in full on the
  detail page). A true per-member-colored avatar stack on `GroupCard` (the list grid) would require
  either an N+1 fetch per card or a backend change to `GroupSummary` — neither done here. **Scope
  split accordingly**: `GroupCard.tsx` keeps its existing single `GroupAvatar` group-icon tile (real
  data it has) and gets the "standalone balance, no card border" treatment; `GroupDetailPage.tsx`
  (which already has full member data) gets the complete avatar-forward treatment — overlapping
  `MemberAvatarStack`, standalone hero balance, desktop panel. This is a real, documented gap, not a
  design choice — flagging for whoever picks up a future "Groups list, avatar-forward" pass that it
  needs `GroupSummary` extended first.
- **Reused the existing `MemberAvatarStack` component** (`components/groups/MemberAvatarStack.tsx`)
  rather than building a new one — it already had deterministic per-member coloring
  (`colorFromMemberId`), overlap (negative margin), and a "+N" overflow avatar, i.e. almost exactly
  the ticket's "overlapping avatar stacks, larger, colored per person" ask. Only change needed was
  passing a larger `size` prop (44 vs. the existing default 32) at the new hero call site; the
  existing small (default-size) header-row usage was left as-is.
- **Hero balance vs. desktop panel — mutually exclusive by breakpoint, not both shown.** The
  bordered `<Card>` balance block (`GroupDetailPage.tsx`) is gone entirely, replaced by two things
  that never render simultaneously: a centered, standalone-typography hero (avatar stack + label +
  large `typeScale.display` number, no border) at `xs`–`md`, and `GroupBalancesPanel` (new, 280px,
  `borderLeft` only) at `lg+`. Matches the actual prototype split found during implementation —
  `v2/Groups.jsx`'s mobile-width `GroupDetail` puts the big number in a centered hero;
  `desktop/DesktopGroupLayout.jsx`'s desktop-width layout puts it in the side panel instead and keeps
  the main content header compact. Gated at `lg` (1200px) rather than `md` (900px) deliberately —
  `lg` is TS-DES-210's sidebar-cutover breakpoint plus this panel's own 280px would overcrowd the
  content column at plain `md` widths.
- **New `GroupBalancesPanel.tsx`**: standalone header number, per-member balance list (reusing
  `colorFromMemberId`/`initialsFromName` from `MemberAvatarStack.tsx` for consistent per-person
  color across both components), Settle Up button. Consumes `balancesQuery.data.members`
  (`MemberBalance[]`, already fetched by the page) — no new API call.
- **New `GroupExpenseRow.tsx`** combines both interaction patterns the ticket asked for in one
  component rather than two: CSS `:hover` swaps the amount display for Edit/Delete icon buttons
  (desktop — `:hover` simply never fires on touch-only devices, so this is naturally a no-op there),
  and a pointer-drag handler reveals the same two actions by translating the row left (touch/mobile,
  matching `v2/Groups.jsx`'s `GroupExpenseRow` drag mechanics — `ACTION_WIDTH`, threshold-based
  open/close snap). "Edit" opens the existing `ExpenseDetailDialog` (same as a row tap always did);
  "Delete" is a **new, separate, faster path** — calls `deleteGroupExpense` directly with a native
  `window.confirm()`, rather than requiring the full detail dialog's own delete-with-confirm flow.
  Both delete paths now coexist (row-level quick delete here; the detail dialog's own delete, still
  reachable via Edit → its delete button) — not a duplication to reconcile, just two entry points at
  different steps of the same action.
- **`GroupCard.tsx`**: balance is now a label ("You're owed"/"You owe"/"Settled up") + standalone
  bold `tabularNums` amount, no `Chip`. Row container itself is still a `Card` — already flat/
  hairline per the global TS-DES-201 theme (`boxShadow: none` baked into `MuiCard` since 101/201),
  so "softer elevation" needed no extra per-component work here.
- **Balances tab kept, not removed** — `desktop/DesktopGroupLayout.jsx`'s reference only has
  `Expenses`/`Activity` tabs at desktop width (Balances lives in the side panel instead), but this
  implementation keeps all three tabs (`Expenses`/`Balances`/`Activity`) at every width and treats
  `GroupBalancesPanel` as an *additional* always-visible convenience at `lg+`, not a tab replacement.
  Lower-risk than conditionally restructuring the tab set by breakpoint; flagging as a deliberate,
  documented deviation from the prototype's exact tab count, not an oversight.
- **Pre-existing bug found, not fixed (out of this ticket's scope)**: at narrow web widths (~390px),
  `GroupDetailPage`'s top header row (back button, `GroupAvatar`, name, small avatar stack, "Add
  Member", settings gear) squeezes the group name out of visible space entirely — confirmed this
  predates this ticket (the row's structure was untouched by this change; only the new hero section
  below it is new). Worth a follow-up ticket, not fixed here to avoid scope creep into an unrelated
  layout bug.
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests — one test
  (`GroupsPage.test.tsx`'s "renders the user's groups") needed updating, since it asserted the old
  single-string `"You're owed $42.17"` chip text, which is now two separate elements (label +
  amount); updated to assert both independently rather than left red. Verified live end-to-end via
  the running `web-ui` dev server (real backend, `formtest@example.com`): created a real two-member
  group, added a $100 expense split equally, confirmed — at 1600px — the desktop `GroupBalancesPanel`
  showed the correct standalone "$50.00" net, correct per-member `+$50.00`/`−$50.00` directional
  colors, and correct per-member avatar colors (green/red, matching `colorFromMemberId`); confirmed
  hover on the expense row swapped the amount for working Edit/Delete icon buttons; confirmed at
  390px the mobile hero (avatar stack + "YOU'RE OWED $50.00", no border) rendered instead of the
  panel, and the pending-member chip still showed for the placeholder member. Swipe-drag itself
  wasn't exercised (no real touch input available in this environment) — verified by code review
  and by confirming the swipe-reveal Edit/Delete buttons exist in the DOM (off-screen via
  `translateX`, not `display:none`) rather than by an actual drag gesture; worth a real-device check
  before considering the touch path fully verified.
