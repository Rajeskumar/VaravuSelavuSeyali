# TS-DES-112: Mobile dashboard parity, broken CTA fixes, and cross-screen polish

## Type
Enhancement (bug fixes + design-system consistency), mobile-only (`varavu_selavu_mobile`).

## Background

The mobile app already carries most of the "Reconcile" design system from earlier TS-DES-10x
tickets (shared color/typography/spacing tokens with web, a persistent global "+" in the bottom
nav pill, and HomeScreen already correctly month-scopes its data — the year-vs-month bug just
fixed on web in TS-DES-111 never existed on mobile). A research pass across theming, navigation,
every major screen, button/interaction patterns, and cross-cutting UX friction found:

1. HomeScreen is missing the three additions TS-DES-111 just brought to web's Dashboard: a
   month-over-month delta, a "What Changed" teaser, and a "Due Soon" recurring strip.
2. **A real, previously-undetected bug:** the "Add an Expense" empty-state CTA buttons on
   `AnalysisScreen`, `ItemInsightsScreen`, and `MerchantInsightsScreen` call
   `navigation.navigate('Add Expense')` — but no screen or route named `"Add Expense"` is
   registered anywhere in `App.tsx`'s navigator. The actual add-expense flow is a context-driven
   overlay (`AddExpenseContext.openAddExpense()`), not a navigable screen. These three buttons are
   dead — pressing them does nothing.
3. **Another real bug:** the global "+" opens a plain React Native `Modal` rendered as a sibling
   overlay to the navigator (`AddExpenseProvider` wraps the app shell but isn't itself a navigator
   screen), so `useIsFocused()` never toggles when it opens/closes. `HomeScreen`, `ExpensesScreen`,
   and `AnalysisScreen` all refetch **only** on focus-change, so none of them reflect an
   expense added via the "+" until the user backgrounds the app or manually pulls to refresh —
   the mobile equivalent of the cross-page refresh gap just fixed on web in TS-DES-111, except it
   affects every screen, not just one.
4. Several invalid hardcoded `fontFamily` strings (`'Inter'`, `'Space Grotesk'`) that don't match
   any font actually registered via `useFonts()` in `App.tsx` (the real names are `'Inter-Regular'`
   / `'Inter-SemiBold'` / etc. and `'SpaceGrotesk-SemiBold'`) — these silently fall back to the OS
   system font instead of the app's typeface, on the entire Analysis tab.
5. A few off-palette hardcoded colors (stray blue/red/green hex not on the jade/ember/gold
   Reconcile scale) and one money-color-policy violation (every expense row cost forced to ember
   regardless of sign, despite `theme.ts`'s own documented policy reserving error/success colors
   for signed directional amounts only).
6. `Card.tsx`, the most-reused surface component, has zero border and relies on a shadow tier
   (`shadows.sm`) that Reconcile's token pass already zeroed to 0 opacity — so cards render with
   no visible edge, unlike the equivalent hairline-bordered card style already defined (but unused
   outside a couple of screens) in `createGlobalStyles()`.

## Scope

1. **HomeScreen dashboard-parity backport** (mirrors TS-DES-111):
   - Month-over-month delta under the hero amount, computed from the year-wide fetch's existing
     `monthly_trend` (mobile already fetches the full year separately from the month — no new
     endpoint call needed, unlike web which had to add one).
   - New `WhatChangedTeaser` component: single top `ChangeInsight`, tap-through to the Analysis tab.
   - New `DueSoonStrip` component: top 3 active (non-paused) recurring templates ranked by
     proximity to today.
   - Replace the silent `console.error`-only fetch failure with a visible `showToast`.
   - Give the empty state a real CTA button (opens the add-expense sheet) instead of a text-only
     hint.
2. **Fix the three dead "Add an Expense" CTA buttons** (`AnalysisScreen`, `ItemInsightsScreen`,
   `MerchantInsightsScreen`): swap `navigation.navigate('Add Expense')` for
   `useContext(AddExpenseContext).openAddExpense()`.
3. **Cross-screen refresh-on-add fix**: a small pub/sub module (`utils/expenseEvents.ts`, mirrors
   the web fix's `notifyExpenseChanged`/`onExpenseChanged` API) that `AddExpenseScreen` calls on
   both successful save paths (personal + group), consumed by `HomeScreen`, `ExpensesScreen`, and
   `AnalysisScreen` to trigger a refetch while mounted.
4. **Typeface fix**: replace invalid `'Inter'` / `'Space Grotesk'` fontFamily strings with
   `theme.typography.fontFamily.*` tokens in `AnalysisScreen.tsx`, `InsightRail.tsx`,
   `AskSheet.tsx`, `TrendNavigator.tsx`.
5. **Palette/policy fixes**:
   - `InsightRail`'s up/down badge: raw `#ef4444`/`#22c55e` → `theme.colors.error`/`success`.
   - `ExpensesScreen`'s action-button/picker-chip background (`#F1F5F9`) and merchant badge
     (`#EFF6FF`/`#3B82F6`) → theme tokens.
   - `ExpensesScreen`'s expense-row cost color: default to `theme.colors.text` (ink) instead of a
     blanket `error`, per the money-color policy already documented in `theme.ts`.
6. **Button consistency**: swap `AnalysisScreen`'s raw `TouchableOpacity`-styled `emptyCta` for
   `CustomButton`.
7. **`Card.tsx` hairline fix**: add the hairline border already used by `createGlobalStyles()` so
   every screen using `Card` gets a visible edge again.

## Explicitly out of scope (flagged for follow-on tickets, not attempted here)

- A full visual rebuild of `ExpensesScreen`'s row layout, or of `ItemInsightsScreen` /
  `MerchantInsightsScreen`, to match web's flat hairline-card treatment (TS-DES-102/107/108) — this
  is real design work, not a fix, and belongs in its own ticket.
- A full accessibility audit (missing `accessibilityLabel`s on icon-only buttons, toast
  announcements) — flagged by the research pass but deliberately not bundled in.
- An exhaustive hex-color audit across every screen — only the off-palette/stray colors found
  during this pass are fixed; most other hardcoded hex values found (white text on filled buttons,
  rgba overlays) are legitimate and were left alone.

## Files touched

- `varavu_selavu_mobile/src/utils/expenseEvents.ts` (new)
- `varavu_selavu_mobile/src/components/WhatChangedTeaser.tsx` (new)
- `varavu_selavu_mobile/src/components/DueSoonStrip.tsx` (new)
- `varavu_selavu_mobile/src/screens/AddExpenseScreen.tsx`
- `varavu_selavu_mobile/src/screens/HomeScreen.tsx`
- `varavu_selavu_mobile/src/screens/ExpensesScreen.tsx`
- `varavu_selavu_mobile/src/screens/AnalysisScreen.tsx`
- `varavu_selavu_mobile/src/screens/ItemInsightsScreen.tsx`
- `varavu_selavu_mobile/src/screens/MerchantInsightsScreen.tsx`
- `varavu_selavu_mobile/src/components/analysis/InsightRail.tsx`
- `varavu_selavu_mobile/src/components/analysis/AskSheet.tsx`
- `varavu_selavu_mobile/src/components/analysis/TrendNavigator.tsx`
- `varavu_selavu_mobile/src/components/Card.tsx`

## Acceptance criteria

- HomeScreen shows a MoM delta (or nothing, if there's no prior-month data), a What Changed
  teaser (or nothing, if there are no insights), and a Due Soon strip (or nothing, if there are no
  active recurring templates) — matching web's empty-state discipline.
- Adding an expense via the global "+" while sitting on Home, Expenses, or Analysis updates that
  screen's numbers without backgrounding the app or pulling to refresh.
- The "Add an Expense" CTA on Analysis/Item Insights/Merchant Insights empty states actually opens
  the add-expense sheet.
- Analysis tab text renders in the app's actual typeface (Inter/Space Grotesk), not the OS system
  font.
- `npx tsc --noEmit` clean in `varavu_selavu_mobile`.
- Manual verification via Expo web preview (no existing screen-level test suite to extend —
  mirrors the web redesign's own verification approach for UI-only changes).

## Dependencies
None — pure mobile-side fixes against already-existing backend endpoints (`getChangeInsights`,
`listRecurringTemplates` are already used elsewhere in the mobile app).

## Implementation notes (post-build)

- **MoM delta** turned out simpler on mobile than web: `HomeScreen` already fetches the year
  (no `month`) and the current month as two separate calls, so the year-wide call's own
  `monthly_trend` already spans every month — no extra trend-only fetch was needed (unlike web's
  TS-DES-111, where the main fetch had to stay month-scoped for the bug fix, forcing a second
  fetch). Rendered as white text with a ▲/▼ glyph (not a jade/ember color swap) since the hero
  card sits on a solid jade gradient — `theme.colors.success` is a jade too close to the
  background to read, and inventing new ad hoc hex values would have introduced an unreviewed
  color. This matches the card's own existing convention of translucent-white text for its
  eyebrow/badge/stat labels.
- **`WhatChangedTeaser` / `DueSoonStrip`**: new components, same data contracts already used
  elsewhere in the mobile app (`getChangeInsights`, `listRecurringTemplates` — both already
  consumed by `AnalysisScreen`/`RecurringExpensesScreen`), same empty-state discipline as web
  (render `null` if there's nothing to show).
- **Cross-screen refresh-on-add**: confirmed via code trace (not runtime, see verification note
  below) that `AddExpenseProvider` renders as a `Modal` sibling to `NavigationContainer`'s
  navigator content, not a navigator screen, so `useIsFocused()` genuinely never toggles when it
  opens/closes. Added `utils/expenseEvents.ts` (mirrors the web fix's pub/sub API) and wired
  `notifyExpenseChanged()` into both of `AddExpenseScreen`'s success paths (personal + group), and
  `onExpenseChanged()` listeners into `HomeScreen`, `ExpensesScreen`, `AnalysisScreen`.
- **Dead CTA fix**: confirmed via `App.tsx`'s full route list that no screen or route named
  `"Add Expense"` is registered anywhere — `AnalysisScreen`/`ItemInsightsScreen`/
  `MerchantInsightsScreen`'s empty-state CTAs calling `navigation.navigate('Add Expense')` were
  genuinely dead. Replaced all three with `useContext(AddExpenseContext).openAddExpense()`.
- **Typeface fix**: confirmed via `App.tsx`'s `useFonts()` call that the only registered family
  names are `Inter-Regular/Medium/SemiBold/Bold/Black` and `SpaceGrotesk-SemiBold` — `'Inter'` and
  `'Space Grotesk'` (used across `AnalysisScreen.tsx`, `InsightRail.tsx`, `AskSheet.tsx`,
  `TrendNavigator.tsx`) aren't registered names, so those texts were silently falling back to the
  OS system font. Replaced with the correct tokens and dropped the now-redundant `fontWeight`
  props those styles paired them with (weight is baked into each font file, not a separate axis).
- **Palette/policy fixes**: `InsightRail`'s badge swapped raw `#ef4444`/`#22c55e` for
  `theme.colors.error`/`success`; `ExpensesScreen`'s `#F1F5F9`/`#EFF6FF`/`#3B82F6` swapped for
  `surfaceSecondary`/`primarySurface`/`primary`; `ExpensesScreen`'s row cost color changed from a
  blanket `error` to `text` (ink), matching `theme.ts`'s own documented money-color policy (signed
  colors reserved for directional balances, not plain expense amounts).
- **`Card.tsx`**: added the hairline border `createGlobalStyles()` already uses, since Reconcile's
  shadow-token pass already zeroed the `sm` shadow tier this component relies on — cards using it
  (`ExpensesScreen`, `AnalysisScreen`'s empty state, others) had no visible edge otherwise.
- **Verification — partial, with a real limitation found along the way**: `npx tsc --noEmit`
  clean; full existing Jest suite (28 tests, 3 suites — `currencyMath`, `groups`, `notifications`)
  passes unchanged. **Interactive click-through verification via the Expo-web preview could not be
  completed**: logging in against a local backend (to reuse the same seeded `dashtest@example.com`
  data used for the web TS-DES-111 verification) surfaced that `expo-secure-store` ships an empty
  stub (`export default {}`) for its web target — `SecureStore.getItemAsync`/`setItemAsync` throw
  on every call in a browser context. This is a genuine, pre-existing, permanent limitation of that
  library's web support (confirmed via its shipped `ExpoSecureStore.web.js`, not a bundler
  misconfiguration), unrelated to anything in this ticket, and blocks login entirely when previewed
  via `expo start --web` — it does **not** affect real iOS/Android usage, where `expo-secure-store`
  is fully implemented. Given this, verification for this ticket rests on: a clean `tsc`, the
  passing existing test suite, and careful manual cross-referencing of every prop/API shape against
  the actual source (not assumption) for each new/edited file. Recommend a real simulator/device
  pass (`npm run ios` / `npm run android`) before shipping if interactive confirmation is wanted.

