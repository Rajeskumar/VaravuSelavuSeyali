# TS-DES-105 — Restyle Plotly (web) and react-native-chart-kit (mobile) output to Reconcile tokens

**Initiative:** Reconcile UX Redesign · **Build order:** 2nd (parallel with 102/103) · **Spec:** `UX_Audit_and_Redesign.md` §3.4/§3.7/§6, `UX_Design_Spec.md` §4.3 · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Implementation notes (post-build)

- **Confirmed live component tree first, as instructed** — grepped for `react-plotly.js`/`Plotly` (web)
  and `react-native-chart-kit` (mobile) rather than trusting the ticket's guessed file list.
  `CategoryBreakdownSunburst.tsx` exists as named, but `SpendTrendChart.tsx` (dashboard) and
  `CategoryBarChart.tsx`/`MonthlyTrendLineChart.tsx` (analysis) are the real Analysis-page chart
  set — `ExpenseAnalysisPage.tsx` never had a donut leading it (it already used a ranked
  `CategorySummaryTable.tsx` + bar chart), so no ranked-list retrofit was needed there. Mobile's
  actual donut/pie consumers are `CategoryDonutChart.tsx` (SVG-based, used on `HomeScreen.tsx`) and
  an inline chart-kit `PieChart` in `AnalysisScreen.tsx` — `CategoryDonutChart`/`TrendLineChart` from
  the ticket's guess list matched real files; the Product Spec's naming was otherwise accurate.
- **Shared restyling helpers, one per platform** (new files, not modifying `theme.ts` — that's
  TS-DES-101's file): `varavu_selavu_ui/src/utils/chartTheme.ts` (`baseChartLayout`,
  `baseChartConfig`, `categoryPalette`, built on top of TS-DES-101's `gradientTokens(mode)`) and
  `varavu_selavu_mobile/src/utils/chartTheme.ts` (`baseChartConfig`, `categoryPalette`,
  `categoryHexPalette`). Every chart component was pointed at these instead of hand-rolled Plotly
  defaults / D3-category10-style hex arrays, so Inter font + hairline gridlines + jade/ember/gold
  series colors are consistent everywhere in one place rather than copy-pasted per component.
  `displayModeBar: false` (web) is applied via the shared `baseChartConfig` to every chart instance
  with no exceptions — no chart in this file tree had a deliberate reason to keep the modebar.
- **Web charts restyled:** `CategoryBarChart.tsx`, `MonthlyTrendLineChart.tsx`,
  `LastSixMonthsLineChart.tsx` (analysis), `MonthlyTrendChart.tsx`, `SpendTrendChart.tsx`,
  `TopCategoriesChart.tsx`, `CategoryBreakdownSunburst.tsx` (dashboard) — all now pull Inter font,
  hairline gridlines, and the shared jade/ember/gold `categoryPalette` instead of Plotly defaults or
  hardcoded hex arrays (`#1f77b4`, `'green'`, `'blue'`, D3-category10, etc.).
- **Donut demotion — added a `compact` prop to `CategoryBreakdownSunburst.tsx`** (web) rather than
  deleting it: shrinks it to a 180px ornament, disables the click-through drawer, and drops
  percent/label text overlays. Left `DashboardPage.tsx` itself untouched — TS-DES-103 (Dashboard
  rebuild) is running concurrently in a separate workstream and owns that page's layout, including
  replacing the sunburst with its own ranked `SpendSpectrum.tsx`; wiring `compact` into
  `DashboardPage.tsx` would collide with that in-flight work, so it's left for whoever lands second
  to wire up (or moot, if `SpendSpectrum` fully replaces the sunburst there).
- **Mobile donut demotion:** `HomeScreen.tsx`'s "Analytics" section led with a full-size
  `CategoryDonutChart` before any ranked list existed. Added a new page-local
  `varavu_selavu_mobile/src/components/CategoryRankedList.tsx` (proportional bar + amount + % per
  category, Design Spec §4.3's ranked-spectrum treatment) as the new lead, and added a `compact` prop
  to `CategoryDonutChart.tsx` (shrinks the SVG rings, drops the legend) for the demoted ornament
  underneath. **Deliberately not named/shaped as `SpendSpectrum`** per this session's instruction —
  TS-DES-103 may introduce a web `SpendSpectrum.tsx` for the Dashboard rebuild; this is a distinct,
  intentionally small mobile-only component. **Flagging for later:** once TS-DES-103 lands, it's
  worth revisiting whether `CategoryRankedList` (mobile) and `SpendSpectrum` (web) should converge on
  one cross-platform ranked-list spec/props shape — not solved here, out of this ticket's scope.
  `AnalysisScreen.tsx`'s inline chart-kit `PieChart` (previously led "Spending Breakdown" above the
  already-existing "Category Details" ranked rows) was moved below that ranked list and shrunk to a
  140×90 "At a glance" ornament with its legend disabled.
- **Sankey ("where the money goes"), web-only, `ExpenseAnalysisPage.tsx`:** new
  `varavu_selavu_ui/src/components/analysis/MoneyFlowSankey.tsx`. Built from data already fetched by
  the page (`AnalysisResponse.category_totals` + `category_expense_details`) rather than adding a new
  API dependency — three tiers: `Total Spend → category → top 3 merchants/descriptions per category
  (+ "— Other" for the remainder)`. Nodes/links use the shared `categoryPalette`/hairline-toned
  alpha-blended links; Inter font throughout; falls back to an explanatory empty state (not a broken
  empty chart) when there's no data yet. No Sankey attempt was made on mobile, per the Design Spec's
  explicit "illegible on a phone" call — mobile keeps only the ranked list.
- **Found and fixed one latent color-mixing bug while restyling mobile's donut:** mobile's shared
  `categoryPalette()` returns some entries already alpha-mixed via `theme.ts`'s `withAlpha` (which
  outputs `rgba(...)`, not hex). An earlier draft of `CategoryDonutChart.tsx`'s subcategory-ring color
  list re-applied a naive hex-alpha-suffix hack on top of those already-`rgba` strings, which would
  have silently produced malformed colors for half the ring. Fixed by adding a `categoryHexPalette()`
  (plain-hex-only) export and deriving the subcategory tint from that instead of from the pre-mixed
  `categoryPalette()` output.
- **Verified:**
  - `npx tsc --noEmit` clean in both `varavu_selavu_ui` and `varavu_selavu_mobile` (mobile has the
    same pre-existing, unrelated failures TS-DES-101 already documented — missing jest globals under
    plain `tsc` for `currencyMath.test.ts`, and `ExpensesScreen.tsx`'s `FlashList` prop type error —
    plus, in this isolated worktree specifically, missing `GroupsScreen`/`GroupDetailScreen`/
    `JoinGroupScreen`/`notifications` modules because this worktree's branch point predates those
    commits; none of these touch this ticket's files).
  - `varavu_selavu_ui`: production build (`react-scripts build`) succeeds cleanly (only pre-existing,
    unrelated ESLint warnings — unused vars/hooks-deps in files this ticket didn't touch).
  - **Not visually verified in a browser, and saying so explicitly rather than claiming otherwise:**
    this session's browser-preview tooling resolves `.claude/launch.json`'s `web-ui`/`mobile-web`
    configs against the main repo checkout, not this isolated worktree (confirmed via `lsof` — the
    already-running preview server's cwd is the main repo's `varavu_selavu_ui`, and it was showing
    live, in-progress third-party navigation/API traffic, not this worktree's build). There was no
    supported way in this environment to point the preview tool at this worktree's own build, so
    screenshotting was skipped rather than risk reporting a false-positive (or disrupting whatever
    session owns that shared server). Separately, `varavu_selavu_mobile`'s Expo web bundling
    (`expo export --platform web`) fails in this worktree with `Unable to resolve module expo` —
    confirmed pre-existing and environment-level, not caused by this ticket's changes: the installed
    `expo@54.0.35` package's `main` field points at an uncompiled `src/Expo.ts` with no corresponding
    `build/*.js`, reproduced identically in the main repo's `node_modules` too.
  - Given the above, verification for this ticket rests on `tsc` (clean) + production build (clean)
    + careful manual code review of every touched file, per this ticket's documented fallback for
    when browser tooling isn't usable — not on an actual rendered screenshot in either light or dark
    mode. **Flagging this as the one acceptance criterion ("dark mode verified for at least one chart
    on each platform") not literally satisfied by a visual check** — the dark-mode code path was
    reviewed (every restyled chart reads `theme.palette.mode` / `useAppTheme().theme.mode` and pulls
    dark-specific hex values already defined by TS-DES-101's palette) but not rendered and screenshotted.
- **Not done / left as-is:** `TopCategoriesChart.tsx`, `MonthlyTrendChart.tsx` (dashboard), and
  `LastSixMonthsLineChart.tsx` (analysis) were restyled for consistency but are currently unreferenced
  by any page (confirmed via grep) — restyled rather than deleted since deleting unreferenced
  components is outside a chart-restyle ticket's scope.

## Scope

Per `UX_Audit_and_Redesign.md` §3.4, the current Plotly charts on web use library-default styling
("generic and heavy... reads as 'a charting library,' not 'TrackSpense'") and lead with a donut for
category breakdown, which the Audit calls out as not scaling past a handful of categories against
the app's real 7-main/44-sub-category taxonomy. §3.7 flags the same donut-scaling problem plus
generally "visually basic" defaults for mobile's `react-native-chart-kit` charts. §6's applied
redesign direction: **demote the donut to a small ornament, make the ranked spectrum (§4.3) the
default category view on both platforms**, restyle all Plotly output to brand (Inter font, hairline
gridlines, no modebar chrome, jade/ember series coloring), and add a **Sankey** "where the money
goes" trace on web as the signature analytical view — explicitly **web-only**; Design Spec §4.3 is
direct that Sankey doesn't fit a phone and mobile should fall back to the ranked spectrum instead of
a shrunk, illegible Sankey.

This ticket covers restyling **chart output**, not the ranked-spectrum **component** itself if that
component is being built as part of `TS-DES-103` (Dashboard's `SpendSpectrum.tsx`) — coordinate at
implementation time so the spectrum isn't built twice. This ticket's job is: (a) rebrand every
existing Plotly/chart-kit instance to the new tokens, (b) demote donuts to ornament-sized secondary
elements wherever they currently lead, and (c) add the Sankey view on web's Analysis surface.

## Files it will touch

- **Web** — Plotly-based chart components under `varavu_selavu_ui/src/components/` (exact file list
  to be confirmed at implementation time against the live component tree; known from the codebase
  read so far: `components/dashboard/CategoryBreakdownSunburst.tsx`, `components/dashboard/
  SpendTrendChart.tsx`, and whatever Plotly components back `ExpenseAnalysisPage.tsx`'s bar/line/donut
  views per the Product Spec's component inventory).
  - Restyle: Inter font family, `hairline` gridlines, remove Plotly's default modebar, recolor series
    to `jade`/`ember`/category-tint colors from the token module rather than Plotly's default
    qualitative palette.
  - Demote any donut-led view so a ranked list (or the shared spectrum component from `TS-DES-103`,
    if ready) is the default, with the donut shrunk to a small glanceable secondary element rather
    than the primary visual.
  - Add a Sankey trace (Plotly supports this natively) as the signature "where the money goes" view
    on `ExpenseAnalysisPage.tsx` specifically (income/spend → categories → merchants, per Design Spec
    §4.3) — web only.
- **Mobile** — `react-native-chart-kit`-based components under `varavu_selavu_mobile/src/components/`
  (known from the Product Spec's component inventory: `CategoryDonutChart`, `TrendLineChart`; exact
  current file names/props to be confirmed at implementation time).
  - Restyle to the same token set as web (Inter, hairline gridlines where chart-kit supports them,
    jade/ember/category-tint series colors).
  - Demote the donut here too; the ranked spectrum is the default mobile category view (no Sankey
    fallback attempt — Design Spec §4.3 explicitly rules that out as illegible on a phone).
- Consumes tokens from `TS-DES-101` (palette + `amount`/tabular-nums for any numeric labels rendered
  directly on/near chart elements).

## Acceptance criteria

- No chart on either platform uses a library-default color palette, font, or gridline style — all
  pull from the Reconcile token module.
- Plotly's default modebar (zoom/pan/download icons) is removed from every chart instance on web
  unless a specific chart has a deliberate reason to keep it (flag any exception explicitly rather
  than leaving it by omission).
- Donut charts, wherever they still exist, are visually secondary/small — no donut is the primary,
  largest visual element on a category-breakdown view on either platform.
- A ranked category list/spectrum is the default category view on both web and mobile (reusing
  `TS-DES-103`'s `SpendSpectrum` component if it's ready by the time this ticket is implemented,
  rather than building a second, divergent implementation).
- A Sankey "where the money goes" view exists on web's `ExpenseAnalysisPage` and is restyled to
  Reconcile tokens (hairline-toned links, jade/ember/category-tint nodes, Inter labels). No Sankey
  attempt exists on mobile.
- Dark mode verified for at least one chart on each platform (gridlines and series colors must
  remain legible against the dark `ink`/`#202127` surfaces from `TS-DES-101`).

## Dependencies

- **TS-DES-101** (tokens must be stable before chart restyling consumes them). No dependency on
  `TS-DES-102`/`103`/`104` — may proceed in parallel with 102/103, though coordinate on the shared
  `SpendSpectrum` component with `TS-DES-103` to avoid duplicate work as noted above.

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's approach for
  UI-only changes.
- Manual verification: run the web app's Analysis page and the mobile app's equivalent
  analysis/insights screen, confirm charts render with the new palette/typography/gridline
  treatment, the Sankey view renders correctly on web, and no console/runtime errors appear on
  either platform in both light and dark mode.
