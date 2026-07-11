# TS-DES-201 — Slate tokens module (web + mobile)

**Initiative:** Redesign v2 · **Build order:** 1st (sole blocker for the whole 2xx series) · **Spec:** `Redesign_Proposal_v2.md` §1, `ORIENTATION_REPORT_V2.md` §1 (TS-DES-101 verdict) · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Replace the **Reconcile** palette (`ink/paper/jade/ember/gold`, `TS-DES-101`) with the **Slate**
palette (`canvas/surface/border/ink/ink-muted/accent/positive/negative/caution`) across both theme
files, keeping the "tokens only, zero structural change" discipline that made 101 easy to verify —
same exported shapes, no page/component structure touched here.

Per `ORIENTATION_REPORT_V2.md` §1's TS-DES-101 verdict, this is a straight replacement, not an
amendment: too much of 101's body (hex table, `directionalColor()` semantics, dark-mode lift rules)
is palette-specific to carry forward. One deliberate policy change ships with the new hex values,
not just a swap: **brand and semantic-positive are no longer the same color.** Reconcile's `jade`
did double duty (brand accent *and* "you're owed money"); Slate's `accent` (indigo-slate,
`#3F3F9E` per the `v2/*.jsx` prototypes' shared `colors` object) is purely a brand/UI accent, and
`positive`/`negative`/`caution` are separate, dedicated semantic tokens — this is intentional for
colorblind users who couldn't previously distinguish "this button is branded" from "this number is
good news" by hue alone.

Hex values, confirmed identical across every `prototypes/v2/*.jsx` file's own `colors` constant
(`ORIENTATION_REPORT_V2.md`'s housekeeping note verified this cross-file, including the file
previously and incorrectly flagged as stale): `canvas #FAFAFA`, `surface #FFFFFF`, `border #E4E4E7`,
`ink #18181B`, `ink-muted #71717A`/`#6B6D74` (confirm exact value against `v2/Dashboard.jsx` at
implementation time — two slightly different values appear across prototype files, resolve to one),
`accent #3F3F9E`, `positive #15803D`, `negative` and `caution` (not yet confirmed hex — grep all
`v2/*.jsx` `colors` objects for a `negative`/`caution` key at implementation time; if absent from
every prototype, derive from Slate's border/ink family rather than reusing Reconcile's `ember`/`gold`
hex outright).

## Files it will touch

- **Web:** `varavu_selavu_ui/src/theme.ts` — replace `reconcile` (TS-DES-101's canonical hex source)
  with a `slate` equivalent; repoint `directionalColor(theme, net)` at `positive`/`negative` instead
  of `jade`/`ember`; repoint `MuiCssBaseline`/`MuiButton.containedPrimary` background from `ink` to
  the new palette's equivalent role. `typeScale`/`tabularNums`, `MuiButton` pill-on-`sizeLarge`
  radius policy, and the flat/hairline elevation policy TS-DES-101 already established are
  unaffected — this ticket only swaps values, not the policies layered on top of them from 101.
- **Mobile:** `varavu_selavu_mobile/src/theme.ts` — replace `lightColors`/`darkColors`' Reconcile hex
  with Slate hex (light/dark variants, same dark-mode lift-for-contrast rule 101 established); no
  change to `ThemeColors` interface shape, `buildShadows()`, `borderRadius` scale, or
  `buildTypography()` roles beyond the color values feeding into them.
- **Chart tokens:** `gradientTokens(mode)` (web, non-`Theme` flat hex export) — repoint at Slate;
  this is the same export TS-DES-208 (chart restyle) will consume.

## Acceptance criteria

- Palette matches the Slate hex values (confirmed against `prototypes/v2/*.jsx`) exactly, light and
  dark, on both platforms.
- `accent` (brand) and `positive` (semantic) are distinct tokens with distinct values — no
  call site relies on them being the same color, confirmed by grep for any remaining
  `jade`/`brand === positive`-style aliasing left over from TS-DES-101.
- `directionalColor()` (web) / mobile equivalent now resolves against `positive`/`negative`, not
  `jade`/`ember`.
- `getTheme(mode)` (web) / `buildTheme(mode)` (mobile) keep their existing exported signatures —
  every current consumer compiles and renders without call-site changes, same bar TS-DES-101 set.
- No visual regression on individual screens is required here (that's every ticket below) — this
  ticket only needs to prove the new tokens are correct, non-breaking, and applied app-wide.

## Dependencies

None — first ticket in the 2xx series, same role TS-DES-101 played for 1xx. Every other 2xx ticket
either directly depends on this landing first or assumes Slate values are already in place.

## Test requirements

- No new test suite required (tokens have no behavior to unit-test); any existing test asserting on
  theme-derived hex/color values must be updated to Slate's values rather than left red.
- Manual visual check: run web (`localhost:3000`) and mobile locally, confirm the app renders with
  Slate applied app-wide (including dark mode) with no console/runtime errors.

## Implementation notes (post-build)

- **Exact hex values resolved during implementation** (the ticket's own scope flagged these as
  unconfirmed): confirmed against `docs/design/prototypes/v2/desktop/DesktopDashboard.jsx`'s `LIGHT`/
  `DARK` constants, the fullest dark-mode-aware color block found in the prototype set. Light: `canvas
  #FAFAFA`, `surface #FFFFFF`, `border #E4E4E7`, `ink #18181B`, `inkMuted #71717A`, `accent #3F3F9E`,
  `positive #15803D`, `negative #B91C1C`, `caution #B45309`. Dark: `canvas #09090B`, `surface #18181B`,
  `border #27272A`, `ink #FAFAFA`, `inkMuted #A1A1AA`, `accent #6D6DC7`, `positive #4ADE80`, `negative
  #F87171`, `caution #FBBF24`. No separate accessible-text variant was needed (unlike Reconcile's
  `jadeText`) — `positive`/`accent` are already dark enough to pass as text color on white.
- **`reconcile` renamed to `slate`, not kept as an alias** — six consumer files imported `reconcile`
  directly for `jade`/`ember`/`gold`/`radius` (`DueSoonStrip.tsx`, `WhatChangedTeaser.tsx`,
  `MyGroupsStrip.tsx`, `TrueTotalHero.tsx`, `GroupsPage.tsx`, `SettleUpDialog.tsx`, plus
  `DashboardPage.tsx` for `radius` only). Rather than blind-renaming call sites, each usage was
  categorized by actual meaning and repointed accordingly — this is the real content of "brand and
  semantic-positive are no longer the same color," not just a token-file change:
  - Money-directional uses (MoM delta sign, settle/pending amounts, what-changed sign, my-groups
    settled/pending) → `positive`/`negative`.
  - Decorative/brand uses (Groups page header icon tile, empty-state icon tile) → `accent`.
  - Ceremony/celebration uses (`TrueTotalHero`'s "RECONCILED" badge, `SettleUpDialog`'s "done"
    checkmark state) → `accent`, since Slate has no dedicated ceremony hue (unlike Reconcile's
    `gold`); reusing the brand hue for a "special, appears rarely" moment preserves the same visual
    distinctiveness `gold` provided, documented inline at both call sites.
- **`gradientTokens()`'s `ceremony` key kept, repointed to `caution`** — purely so `chartTheme.ts`'s
  `categoryPalette()` (TS-DES-105's own file, out of this ticket's scope) keeps compiling with zero
  call-site changes. TS-DES-208 (chart restyle) owns deciding whether chart series should keep using
  this key at all.
- **Mobile:** `ThemeColors.gold` field name kept (interface shape unchanged per the ticket's own
  constraint) but its value now resolves to `accent`/`accentDark` — same ceremony→accent policy as
  web, confirmed against `SettleUpSheet.tsx`'s matching "done" state usage (mirrors web's
  `SettleUpDialog.tsx` exactly). A handful of stale `// Reconcile ...` comments elsewhere in the file
  (radius scale, display typeface, elevation policy) were reworded for accuracy — those policies are
  unchanged by this ticket, only their old palette-specific comment attribution was stale.
- **Verified:** `npx tsc --noEmit` clean on both `varavu_selavu_ui` and `varavu_selavu_mobile`. Full
  web Jest suite: 14 suites / 46 tests, all passing, no assertions needed updating (none of the
  existing tests assert on specific hex values). Grepped both source trees for every old Reconcile hex
  literal (`#0FA37F`, `#1CBE94`, `#0B8A6B`, `#DE5B4B`, `#E8705F`, `#C9973F`, `#D9A752`, `#B78A2E`,
  `#C99A42`) — zero remaining hits outside this ticket's own diff. Verified live via a running
  `web-ui` dev server (already-authenticated session, port 3000): Login page hero/CTA render in
  indigo-slate instead of jade; Dashboard's MoM delta correctly shows negative-red for a spend
  increase; Groups page header/empty-state icon tiles render in the brand accent; dark mode toggled
  and confirmed correct canvas/surface/border/text swap and indigo accent persisting in the FAB and
  active nav pill. Settle-up "done" ceremony state and `TrueTotalHero`'s "RECONCILED" badge were not
  exercised live (no test group with a real settle-up flow was seeded) — their accent-repoint is
  confirmed by code inspection only, not a live screenshot; worth a live check the next time a
  populated test group is available.
