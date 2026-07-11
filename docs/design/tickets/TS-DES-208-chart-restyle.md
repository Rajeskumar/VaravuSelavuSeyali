# TS-DES-208 — Chart restyle: Slate series colors

**Initiative:** Redesign v2 · **Build order:** 3rd (depends on 201 only; smallest ticket in the set) · **Spec:** `ORIENTATION_REPORT_V2.md` §1 (TS-DES-105 verdict) · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Scope

Supersedes TS-DES-105. The chart *policy* 105 already established (hairline gridlines, tabular
numerals, no modebar, restyle donut→spectrum) is untouched by the v2 pivot — only the specific series
color values change: `jade/ember/gold` (Reconcile) → `accent/positive/negative/caution` (Slate).
Lower-effort than every other 2xx ticket; close to a pure value-swap once TS-DES-201's `gradientTokens`
export lands with the new hex values.

## Files it will touch

- Web (Plotly): every chart call site currently sourcing colors from the pre-201 `gradientTokens`
  export or hardcoded `jade`/`ember`/`gold` hex — repoint at TS-DES-201's Slate equivalents. No
  change to chart type, gridline policy, tabular-nums, or modebar suppression — those are 105's
  policy work, already done and unaffected.
- Mobile (`react-native-chart-kit`): same color-source repoint, no structural chart change.
- `CategorySpectrum`/donut→spectrum restyle (105's structural change) — carried forward unchanged;
  this ticket only updates the color values feeding it.

## Acceptance criteria

- Every chart (web Plotly + mobile chart-kit) renders using Slate's `accent`/`positive`/`negative`/
  `caution` series colors, with no remaining Reconcile hex (`jade`/`ember`/`gold`) referenced
  anywhere in chart-rendering code.
- Chart policy from 105 (hairline gridlines, tabular numerals, no modebar, spectrum layout) is
  unchanged — this ticket doesn't regress any of that.
- Dark mode verified for chart colors specifically (Slate's dark-mode contrast lift, established in
  TS-DES-201, must carry through to chart series correctly, not just UI chrome).

## Dependencies

TS-DES-201 (Slate tokens) — hard blocker, since this ticket is purely consuming 201's new
`gradientTokens` export. No dependency on 202/210 or any other 2xx ticket.

## Test requirements

- No new test suite required (visual/color-only change).
- Manual verification: check every chart-bearing screen (Dashboard spectrum, Analysis trend/category
  charts, mobile equivalents) in both light and dark mode, confirm no stray Reconcile hex remains
  visible anywhere.

## Implementation notes (post-build)

- **Smaller than scoped — most of this ticket was already done by TS-DES-201.**
  `chartTheme.ts`'s `categoryPalette()` consumes `gradientTokens(mode)`, which TS-DES-201 already
  repointed to Slate hex; that function needed zero further changes here. The only genuinely
  stray hardcoded hex left anywhere in the web app were two small helpers in the same file —
  `chartHairline()` (`#33343B`/`#E4E4DF`, Reconcile's hairline) and `chartTextColor()`
  (`#9A9CA3`/`#6B6D74`, Reconcile's ink-muted) — neither routed through `gradientTokens` or the
  `slate` object at all, just inline literals. Repointed both at `slate.border`/`slate.borderDark`
  and `slate.inkMuted`/`slate.inkMutedDark` respectively.
- **Mobile required zero changes** — checked `TrendLineChart.tsx` and `HomeScreen.tsx` (the two
  `react-native-chart-kit`/chart consumers) before assuming work was needed: both already source
  every color dynamically from `theme.colors.*`, which TS-DES-201 already repointed to Slate.
  Confirmed via a full grep across `varavu_selavu_mobile/src` for every Reconcile hex value —
  zero hits.
- **Confirmed via grep, not just spot-checking**: searched both `varavu_selavu_ui/src` and
  `varavu_selavu_mobile/src` for every Reconcile-era hex literal used anywhere in this redesign
  (jade/ember/gold/caution variants, ink/paper) — zero remaining hits after this ticket's two-line
  fix, versus one file (`chartTheme.ts`) before it.
- **Verified:** `npx tsc --noEmit` clean. Full web Jest suite: 14 suites / 46 tests, all passing
  (no test asserts on these specific hex values). Live-verified against the running `web-ui` dev
  server after the mid-session Playwright tool outage recovered: Analysis's "Where the Money Goes"
  Sankey chart rendered correctly in light mode; the category-breakdown bar, trend-nav bars, and
  lens control all showed correct Slate coloring in dark mode (confirmed via full-page screenshot
  at `/analysis`); no stray Reconcile hex visible anywhere across either mode. The trend-nav and
  category-spectrum bars in both screenshots use muted per-category tint colors (a separate,
  deterministic per-category hash unrelated to this ticket's brand/semantic series palette), which
  is expected and correctly untouched by this ticket's scope.
