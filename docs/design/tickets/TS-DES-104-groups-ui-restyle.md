# TS-DES-104 — Restyle already-built Groups UI onto Reconcile tokens + settle-up hero/count-to-zero

**Initiative:** Reconcile UX Redesign · **Build order:** 3rd (last; depends on 101 only) · **Spec:** `UX_Design_Spec.md` §4.5/§5/§6, `UX_Audit_and_Redesign.md` §3.7/§5/§6, `ORIENTATION_REPORT.md` §2.2's mobile note/§3, `docs/design/prototypes/SettleUp.jsx` · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Implementation notes (post-build)

- **Provisioning problem, not a repo problem — three consecutive delegated attempts at this ticket
  (two `remote`-isolation, one `worktree`-isolation) each landed on the same stale commit
  (`abdb3eb`, ~100+ commits behind, predating the entire Groups feature and this initiative's own
  101/102/103/105 work) despite `feature/groups-phase-1`'s real tip being unchanged throughout.
  Each agent correctly halted per the explicit anti-guessing instruction rather than reconstructing
  missing work. Given the repeated failure was environmental (base-commit provisioning), not fixable
  by switching isolation modes again, this ticket was implemented directly in the primary session
  instead of via a fourth delegated attempt — this is the one TS-DES ticket in the set not built by
  a subagent.
- **Most of "restyle onto Reconcile tokens" required zero code changes** — `GroupDetailPage.tsx`,
  `BalanceList.tsx`, `SplitEditor.tsx` (web), `BalanceRow.tsx`, mobile `SplitEditor.tsx`,
  `GroupsScreen.tsx`'s balance-color logic, and `SegmentedTabs.tsx` all already parametrized on
  `theme.palette.success/error/text.secondary` (web) or `theme.colors.success/error/textTertiary`
  (mobile) rather than hardcoded hex, so TS-DES-101's token swap already flowed through correctly.
  Verified this rather than assumed it, by reading every listed file before touching anything.
- **Real code changes, and why each was needed:**
  - `GroupsPage.tsx` — the header icon tile and empty-state circle built their own
    `linear-gradient(135deg, brand.gradientStart, brand.gradientEnd)` inline. TS-DES-101 flattened
    `brand.gradientStart === brand.gradientEnd`, so this already *rendered* flat, but the literal
    `linear-gradient(...)` CSS call still existed in source — replaced with a flat
    `backgroundColor: reconcile.jade` to satisfy "no gradient fills" literally, not just visually.
  - `GroupAvatar.tsx` — had its own hardcoded 6-pair gradient palette (`GRADIENTS`, blue→purple etc.)
    completely independent of `theme.ts`, plus a raw `boxShadow`. Replaced with `TILE_COLORS`, a
    6-color flat muted palette matching `SettleUp.jsx`'s member-avatar hues (`#7E8CA3`, `#C97B4D`,
    etc.), and dropped the shadow (hairline card border from the parent `GroupCard`/`Card` already
    provides definition — elevation reserved for sheets only, per Design Spec §9).
  - `SettleUpDialog.tsx` (web) / `SettleUpSheet.tsx` (mobile) — the actual structural addition. Added
    a `stage: 'review' | 'settling' | 'done'` state machine and a 900ms cubic-ease-out count-down
    (web: `requestAnimationFrame` + `performance.now()`; mobile: the same via `Date.now()`, not
    reanimated — see below) matching `SettleUp.jsx` exactly. Hero shows the settlement amount in
    jade during review/settling (there's no natural "sign" for a single settlement the way there is
    for a whole-group net position, since our data model settles one from/to/amount at a time, not
    the prototype's whole-group multi-transfer flow — flagging this as a deliberate scope adaptation,
    not an oversight), then a gold `TaskAltRounded`/`checkmark-circle` icon + "All squared up" +
    `$0.00` on completion. The dialog no longer auto-closes on success — it waits for an explicit
    "Done" tap on the resolution screen, matching the prototype's two-stage flow.
  - Mobile's count-down uses a plain JS `requestAnimationFrame` loop (mirroring web's), not
    `react-native-reanimated`, despite the ticket suggesting `motion.spring`/`springBouncy` — a
    shared-value spring animates toward a *target*, but this needs to *read* a continuously-changing
    numeric value into `Text` content every frame, which reanimated's worklet model doesn't do
    cleanly without extra machinery (`useAnimatedProps` on a custom animatable Text component). The
    JS RAF loop is simpler, already proven correct on web, and RN's Hermes engine supports
    `requestAnimationFrame` natively — no new dependency needed.
  - Mobile `GroupsScreen.tsx`'s `card` and `GroupDetailScreen.tsx`'s `balanceBanner`/`tabItemActive`
    styles relied entirely on `...theme.shadows.xs` for visual separation from the page background.
    TS-DES-101 zeroed out the `xs`/`sm`/`md` shadow tiers ("elevation reserved for sheets only"), which
    would have left these elements with no visible edge at all against a same-toned background.
    Added explicit hairline borders (`StyleSheet.hairlineWidth` + `theme.colors.borderLight`) to all
    three, restoring definition the Design Spec's own way ("hairline + tint") instead of the shadow
    that's no longer there.
- **Real bug found and fixed during verification, not just noted:** the web `SettleUpDialog`'s
  reset effect originally depended on `[open, members]`. `members` is the live balances array passed
  from `GroupDetailPage`, and this dialog's own `onSuccess()` call (fired mid-settlement, before the
  count-down animation finishes) triggers a `queryClient.invalidateQueries` that changes that array's
  reference — which re-ran the reset effect *while the resolution screen was showing*, wiping
  `fromMemberId`/`toMemberId` back to `''` (recomputed against the now-zeroed post-settlement
  balances) and breaking the "X paid Y" name lookup on the done screen (confirmed via live testing:
  the text rendered as "paid — balances updated." with both names missing). Fixed by making the reset
  edge-triggered on the closed→open transition only (a `wasOpenRef`), reading `members` from a ref
  instead of a reactive dependency. Re-verified live after the fix — names render correctly.
- **`SettleUpDialog.test.tsx` updated, not left red** (per the ticket's test-requirements note): one
  test asserted `onClose` was called synchronously after submit, which is no longer true by design —
  updated it to wait for the "Done" button (real ~900ms animation, not mocked/faked timers), assert
  `onClose` is *not* called before that, then click "Done" and assert it fires. Business-logic
  assertions (the exact `createSettlement` payload, `onSuccess` firing) were left untouched.
- **Verified live** (`preview_start` "web-ui", real backend, `grouptester@example.com`): navigated to
  the "Iceland Trip" group, confirmed `BalanceList` renders signed amounts with explicit words ("is
  owed $75.00" / "owes $75.00"), opened Settle Up, submitted, watched the hero count down from
  $75.00 → $0.00 in real time, confirmed the gold "All squared up" resolution screen showed the
  correct names post-fix, tapped Done, confirmed the balance card updated to "You're all settled up"
  and the balances list to "Everyone is settled up." Repeated the same check in dark mode (toggled
  via `localStorage['vs_theme_mode']`) on both `GroupDetailPage`'s Expenses and Balances tabs and the
  full settle-up flow — hairline borders, jade/gold/ink colors, and flat (non-gradient) avatar tiles
  all render correctly against the dark `ink` background.
- **Not independently visually verified — mobile.** `tsc --noEmit` is clean for every touched mobile
  file (confirmed via targeted `grep` against the full error list, matching TS-DES-101/105's own
  documented pre-existing failures only — `groups.test.ts`, `notifications.test.ts`,
  `ExpensesScreen.tsx`'s unrelated `FlashList` prop type, `currencyMath.test.ts`'s missing jest
  globals under plain `tsc`). The `mobile-web` preview target has the same pre-existing
  `expo-secure-store`-has-no-web-implementation login blocker documented in TS-DES-101's notes: not
  investigated further here either. Mobile's `SettleUpSheet`/`GroupsScreen`/`GroupDetailScreen`
  changes are structurally identical to their now-live-verified web counterparts (same stage
  machine, same token usage, same hairline-border fix), but a native-simulator pass is the honest
  remaining gap before calling mobile fully done — flagging rather than claiming it.
- **Deviations from ticket scope:** none beyond the mobile-animation-mechanism substitution (RAF
  instead of reanimated) and the mobile-visual-verification gap, both explained above.

## Scope

The Groups feature's UI (web and mobile) was built and already once re-skinned against a
now-superseded theme (see `ORIENTATION_REPORT.md` §3 for the full per-ticket staleness breakdown of
`TS-GRP-107`/`108`/`109`). This ticket restyles that already-working UI onto the Reconcile tokens
from `TS-DES-101` — it does **not** re-litigate the underlying component structure, data flow, or
business logic (split calculation, balance computation, invite flow, etc.), all of which stay as-is.

One structural addition is explicitly in scope: **the net-position hero + count-to-zero confirmation
animation** on settle-up, per `SettleUp.jsx`'s reference — today's `SettleUpDialog`/`SettleUpSheet`
show a from→to avatar preview but have no top-level net-position number and no confirmation animation
when a settlement completes; both need to be added to match the reference.

Scheduled last in this initiative — not because it's lower priority, but because re-tokening UI twice
(once now, again if `TS-DES-101`'s values shift during its own review) is wasted work. It has no
dependency on `TS-DES-102`/`103`/`105` and can be pulled forward if `101` lands first and there's
capacity before those other tickets are ready.

## Files it will touch

- **Web:**
  - `varavu_selavu_ui/src/pages/GroupsPage.tsx`, `GroupDetailPage.tsx`
  - `varavu_selavu_ui/src/components/groups/SplitEditor.tsx`, `BalanceList.tsx`, `SettleUpDialog.tsx`
  - Incidental restyle from the same token swap (not separately re-architected, but will change
    appearance since they consume the same tokens/`glassCardSx`-equivalent as the pages above):
    `GroupCard.tsx`, `GroupAvatar.tsx`, `SegmentedTabs.tsx`, `InviteDialog.tsx`. Confirm at
    implementation time whether any of these need more than a token pass.
  - `SettleUpDialog.tsx` — add the net-position hero (display-face, tabular-nums, jade/ember by sign)
    above the existing from→to avatar preview, and a count-to-zero animation on the amount when a
    settlement is confirmed, matching `SettleUp.jsx`'s `stage: 'review' | 'settling' | 'done'` flow
    and its `BadgeCheck`/gold "All squared up" resolution state.
- **Mobile:**
  - `varavu_selavu_mobile/src/screens/GroupsScreen.tsx`, `GroupDetailScreen.tsx`
  - `varavu_selavu_mobile/src/components/BalanceRow.tsx`, `SettleUpSheet.tsx`
  - `SettleUpSheet.tsx` — same net-position hero + count-to-zero addition as web's `SettleUpDialog`,
    using `motion.spring`/`springBouncy` (kept as-is per `TS-DES-101`) for the count-down animation
    via `react-native-reanimated`.
  - Incidental restyle, same caveat as web: `SplitEditor.tsx` (RN), any Groups-specific use of
    `Card.tsx`.
- Consumes tokens from `TS-DES-101` throughout: `ink`-default money color for neutral amounts,
  `jade`/`ember` for signed balances (owed-to-you/`+`, you-owe/`−`, always paired with the word per
  Design Spec §2's accessibility rule — never color alone), `hairline` dividers replacing any
  remaining card shadows in list rows, `amount`/`tabular-nums` on every balance figure, `gold` for
  the "all squared up" resolution moment only.

## Acceptance criteria

- Every listed file renders using `TS-DES-101`'s tokens — no leftover gradient fills, blur, or
  blanket hover-lift/shadow from the retired theme values.
- Balance figures (`BalanceList`/`BalanceRow`) use `jade`/`ember` with an explicit sign (`+`/`−`) and
  word (e.g. "owes you"/"you owe") — never color alone, per Design Spec §2's accessibility floor.
- `SettleUpDialog` (web) and `SettleUpSheet` (mobile) both show a net-position hero above the
  member-list/preview, matching `SettleUp.jsx`'s layout (net label + large signed tabular amount).
- Confirming a settlement triggers a count-down-to-zero animation on the amount, ending in a gold
  "all squared up"/reconciled state — not an instant snap to the new value.
- No change to split-calculation logic, balance computation, invite acceptance flow, or any backend
  contract — this ticket is visual + the one named animation addition, nothing else.
- Dark mode verified on at least `GroupDetailPage`/`GroupDetailScreen` and the settle-up flow on both
  platforms (this redesign's dark-mode requirement is a first-class one per Design Spec §2, not a
  toggle-later item).

## Dependencies

- **TS-DES-101** (tokens must be stable — this is this ticket's only dependency; it does not wait on
  102/103/105).

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's established
  approach (visual verification over test-suite verification for UI-only changes).
- Manual verification: run the web app and the mobile simulator, walk through create-group → add
  expense → view balances → settle up on both platforms, confirm the hero/count-to-zero animation
  fires correctly and the restyled screens match the token values from `TS-DES-101` and the layout
  intent of `SettleUp.jsx`.
- If existing component tests (`SplitEditor` validation, `SettleUpDialog` submit, etc.) assert on
  removed styling hooks, update them; do not touch assertions on business logic (split math, balance
  computation) which should be unaffected by this ticket.
