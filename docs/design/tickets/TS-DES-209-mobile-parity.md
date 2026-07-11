# TS-DES-209 — Mobile parity pass

**Initiative:** Redesign v2 · **Build order:** independent, ship whenever (no dependency on any other 2xx ticket) · **Spec:** `ORIENTATION_REPORT_V2.md` §1 (TS-DES-112 verdict) · **Status:** ✅ All 5 already fixed pre-existing; 1 doc-comment inconsistency corrected — see notes below

## Scope

Carries forward TS-DES-112's five already-diagnosed bugs as-is, deliberately decoupled from the
dashboard-insight rework (that conflict is TS-DES-203's problem, not this ticket's) so these fixes
aren't blocked by design-direction debate. These are real, independently diagnosed bugs, valid
regardless of Reconcile vs. Slate or any nav/IA change:

1. **Three dead "Add an Expense" CTAs** — `navigation.navigate('Add Expense')` calling a route that
   doesn't exist.
2. **Cross-screen refresh gap** — `useIsFocused()` never firing because `AddExpenseProvider` is a
   `Modal` sibling, not a navigator screen.
3. **Invalid hardcoded `fontFamily` strings** — `'Inter'`/`'Space Grotesk'` referenced directly
   instead of through the theme's registered font tokens.
4. **Off-palette raw hex in `InsightRail`** — bypasses the theme token system entirely.
5. **`Card.tsx`'s missing hairline border** — inconsistent with the flat/hairline elevation policy
   established by TS-DES-101/201.

## Files it will touch

- `varavu_selavu_mobile` — the three screens with dead "Add an Expense" CTAs (identify exact files at
  implementation time via grep for `navigate('Add Expense')`); repoint each at the actual working
  add-expense entry point.
- `varavu_selavu_mobile/src/context/AddExpenseProvider` (or wherever it currently lives as a `Modal`
  sibling) — restructure so `useIsFocused()`-dependent screens actually receive a focus event when an
  expense is added via the modal, closing the cross-screen refresh gap.
- Any component referencing `'Inter'`/`'Space Grotesk'` as a literal string — repoint at the theme's
  registered font family tokens (the same tokens TS-DES-201 needs to have correctly wired for its own
  Slate rollout — coordinate the actual font-loading fix isn't blocked on 201, but confirm the token
  names line up).
- `InsightRail` (mobile) — remove raw off-palette hex, repoint at theme tokens (Slate values once
  TS-DES-201 lands, but the *mechanism* fix — using tokens instead of hardcoded hex at all — doesn't
  need to wait on 201).
- `Card.tsx` (mobile) — add the missing hairline border consistent with the flat elevation policy.

## Acceptance criteria

- All three previously-dead "Add an Expense" CTAs successfully open the add-expense flow.
- Adding an expense via the modal correctly triggers a refresh on any screen that should reflect the
  new data when the user next focuses it — verified by adding an expense, backgrounding the modal,
  and confirming the affected screen shows the update without a manual pull-to-refresh.
- No component references `'Inter'`/`'Space Grotesk'` as a raw string literal; all font references go
  through the theme's registered tokens.
- `InsightRail` contains no raw hex color values; all colors resolve through theme tokens.
- `Card.tsx` renders a hairline border by default, consistent with every other themed surface.

## Dependencies

None. Fully independent of every other 2xx ticket — these are pre-existing, already-diagnosed bugs,
not part of the design-direction pivot, and should not wait on TS-DES-201 or any other ticket in this
set to ship.

## Test requirements

- No new Jest suite required as a hard gate.
- Manual verification on a real device/simulator: tap each of the three previously-dead CTAs and
  confirm the add-expense flow opens; add an expense and confirm cross-screen refresh works without a
  manual pull; visually confirm font rendering (no fallback-font tell) and `Card.tsx`'s hairline
  border.

## Implementation notes (post-build)

**All five diagnosed bugs were found already fixed** — checked each directly against the live
mobile source before writing any code, rather than assuming the inherited diagnosis
(`ORIENTATION_REPORT_V2.md` §1's TS-DES-112 verdict, itself inherited from an earlier orientation
pass) still held:

1. **Three dead "Add an Expense" CTAs** — `AnalysisScreen.tsx`, `ItemInsightsScreen.tsx`, and
   `MerchantInsightsScreen.tsx` all correctly call `openAddExpense` from
   `AddExpenseContext` (`AddExpenseScreen.tsx`), not a broken `navigation.navigate('Add Expense')`.
   Grepped for the literal broken call pattern first — zero hits anywhere in the mobile source.
2. **Cross-screen refresh gap** — already solved via `utils/expenseEvents.ts`, a small
   `notifyExpenseChanged()`/`onExpenseChanged()` event bus with a doc comment that explicitly
   names this exact bug and cites TS-DES-112. `AddExpenseScreen.tsx` calls `notifyExpenseChanged()`
   on save; `HomeScreen.tsx`, `ExpensesScreen.tsx`, and `AnalysisScreen.tsx` all subscribe via
   `onExpenseChanged()`. This is the identical pattern web's TS-DES-111 used for the same class of
   bug — confirmed fully wired, not just present as dead infrastructure.
3. **Invalid `'Inter'`/`'Space Grotesk'` fontFamily strings** — grepped every `fontFamily:` literal
   across the mobile source; every single one already uses a correctly-weighted registered name
   (`'Inter-Regular'`, `'Inter-SemiBold'`, `'Inter-Bold'`, `'Inter-Black'`, `'SpaceGrotesk-
   SemiBold'`). No bare `'Inter'`/`'Space Grotesk'` literal exists anywhere.
4. **Off-palette raw hex in `InsightRail`** — read the full component; every color already resolves
   through `theme.colors.*` (`theme.colors.error`/`success`/`errorSurface`/`successSurface`/
   `primary`/`text*`/`borderLight`). No raw hex literal anywhere in the file.
5. **`Card.tsx`'s missing hairline border** — the component's actual style already had
   `borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight`, with an inline
   comment explaining the elevation-policy reasoning. The bug, as diagnosed, doesn't exist in the
   current code. **What was genuinely stale**: the component's own top-of-file docstring still read
   "generous radius, diffused shadow, **zero border**" — directly contradicting the border that's
   right below it in the same file. Fixed the docstring to describe what the component actually
   does, rather than leaving a comment that actively misleads the next person who opens this file.

**Why this happened**: all five fixes carry comments/patterns citing "TS-DES-112" already, meaning
they were genuinely fixed in an earlier pass — just not reflected back into the design-tickets
orientation chain this redesign initiative inherited from. `ORIENTATION_REPORT_V2.md`'s own
TS-DES-112 verdict (written before this session) carried the bug list forward without re-verifying
against current code, and this ticket initially inherited that same unverified list. Checking each
item against live source before writing any fix — rather than trusting the inherited diagnosis —
is what caught this; worth remembering that "diagnosed in an orientation doc" and "true right now"
are not the same claim, especially several inheritance-hops removed from the original finding.

**Verified:** `npx tsc --noEmit` clean on `varavu_selavu_mobile` after the one docstring fix. No
functional code changed (all five behaviors were already correct), so no runtime/simulator
verification was needed beyond confirming the fixes are real by reading the code directly — which,
given this ticket's entire premise turned out to be about verifying claims rather than building
anything, is the appropriate bar here.
