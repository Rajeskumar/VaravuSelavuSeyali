# TS-DES-108 — Merchant Insights rebuild

**Initiative:** Reconcile UX Redesign · **Build order:** 4th (batch 2; no cross-team dependency, can go first) · **Spec:** `UX_Design_Spec.md` §4.4/§6 (screen-by-screen: "Merchant header → item tape → what-changed tile"), `docs/design/prototypes/MerchantInsights.jsx` · **Status:** ✅ Built — Ranked list, `MonthlySpendSparkline`, `WhatChangedCallout` (header corrected 2026-07-10 to match `FEATURE_STATUS.md`; was stale "Not started" — see `ORIENTATION_REPORT_V2.md` §4)

## Located before scoping, per instruction

Same caveat as TS-DES-107 — Merchant Insights is also absent from the Groups Product Spec's page
inventory. Verified against `FEATURE_STATUS.md` and the live repo:

- `FEATURE_STATUS.md` §2 lists **TS-ANL-002 — Merchant Insights: ✅ Built**, web only, as a
  **dedicated page** — confirmed live: `varavu_selavu_ui/src/pages/MerchantInsightsPage.tsx`, same
  list-view/detail-view-in-one-component shape as Item Insights, `?merchant=` query-param deep
  link. Not a section inside `ExpenseAnalysisPage.tsx`, not a modal.
- Mobile screen already exists (`varavu_selavu_mobile/src/screens/MerchantInsightsScreen.tsx`),
  same "not updated this pass, web-only" status per `FEATURE_STATUS.md` — flagged, not built here.
- Backend confirmed already built: `merchant_insights`/`merchant_aggregates` tables,
  `getTopMerchants`/`getMerchantDetail` in `varavu_selavu_ui/src/api/analytics.ts` against real
  `/analytics/merchants` endpoints. Self-contained UI rebuild, no backend dependency.

## Scope

Replace `MerchantInsightsPage.tsx`'s current structure — four `SummaryCard`s (Top Merchant/Total
Spend/Avg Basket/Biggest Riser), a flat `List` with avatar+chip rows, and a detail view built from
a summary `Box` row, a yearly-rollup `Box` row, a `LinearProgress`-bar-per-month "Monthly Spending"
list, and two MUI `Table`s (Recent Transactions, Items Bought Here) — with `MerchantInsights.jsx`'s
pattern: a plain ranked merchant list, and a detail view with `StatBlock`s (Lifetime
Spent/Visits/Avg-per-Visit), a **monthly spend sparkline** (bar-per-month, not a `LinearProgress`
list), a single **"what changed here" callout** (plain sentence in a bordered box — not KPI cards
or a yearly rollup section), and an **items-bought-there list** that reuses Item Insights'
row/trend-arrow vocabulary (TS-DES-107) rather than a separate table styling.

## Files it will touch

- `varavu_selavu_ui/src/pages/MerchantInsightsPage.tsx` — list view restyled to the ranked-row
  pattern (matching Item Insights' list for visual consistency between the two insight pages);
  detail view rebuilt per the components below.
- **New components** under `varavu_selavu_ui/src/components/analysis/`:
  - `MonthlySpendSparkline.tsx` — bar-per-month sparkline per `MonthlySpark`, replacing the
    `LinearProgress`-per-month "Monthly Spending" section. The current page's **yearly rollup**
    section (multi-year `monthly_aggregates` grouped by year) has no equivalent in the 6-month-only
    prototype — decide at implementation time whether to keep a compact yearly rollup for
    merchants with multi-year history (real data, unlike the prototype's fixed demo set, can span
    years) or fold it into the sparkline's tooltip/label; don't silently drop real multi-year data
    the current page correctly surfaces.
  - `WhatChangedCallout.tsx` — single plain-sentence callout box per the prototype's `whatChanged`
    string. **Not built anywhere server-side today** — the prototype's `whatChanged` text is
    hardcoded per merchant ("You visited 2 more times than last month"). Check whether
    `MerchantInsightDetail`'s API response has an equivalent field (e.g. reusing
    `month_over_month_change_percent`/`_amount` to synthesize a sentence client-side, matching the
    tone) before assuming a new backend field is needed — this is very plausibly composable from
    data already in the response (the existing MoM chip already computes the delta; this callout
    just needs to phrase it as a sentence) rather than a real backend gap like TS-DES-106's
    "Ask why" caveat.
  - Items-bought list — reuse whatever row component TS-DES-107 builds for Item Insights' list
    (same trend-arrow + amount pattern), rather than inventing a second items-list styling. This
    ticket should land after or alongside TS-DES-107 for that reuse to be possible without
    duplicating work — see Dependencies.
- Existing `getTopMerchants`/`getMerchantDetail`, `InsightScopeFilter`/`ScopeBadge` — untouched.

## Acceptance criteria

- List view: ranked rows (name, visit count + category, lifetime spend) — no avatar circles, no
  MUI `List`/`ListItemAvatar` treatment, matching the plain-row pattern used elsewhere.
- Detail view: `StatBlock`s for Lifetime Spent/Visits/Avg-per-Visit, a monthly spend sparkline (not
  a progress-bar list), a single what-changed-here callout sentence, and an items-bought-here list
  matching Item Insights' row vocabulary — all replacing their current MUI-table/KPI-card
  equivalents.
- Multi-year merchant history (the current yearly rollup) is still representable somewhere in the
  new detail view — not silently dropped just because the reference prototype's demo data is
  6-months-only.
- "Ask AI about this merchant" chip/deep-link still works.
- Recent Transactions (currently a `Table`) — decide at implementation time whether this folds into
  the items-bought-there list, becomes its own restyled feed-row list (matching `ExpenseFeed`'s
  row pattern from TS-DES-102), or is dropped in favor of the purchase-tape-style history if that
  turns out to cover the same need — don't leave it as a bare unstyled `Table` either way.
- Dark mode verified.
- No backend or API-client changes, unless the "what changed here" callout genuinely can't be
  synthesized from the existing response fields — if so, flag that finding explicitly rather than
  fabricating client-side data that isn't really there.

## Dependencies

None hard-blocking, but **sequence after or alongside TS-DES-107** if practical — reusing Item
Insights' row component for the "items bought here" list avoids building that vocabulary twice.
Not a hard dependency: if TS-DES-107 hasn't landed yet, build this ticket's own minimal version and
reconcile later, same pattern used for `SpendSpectrum`/`CategoryRankedList` in TS-DES-103/105.

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's approach.
- Manual verification: run the web app, confirm list/detail views render correctly against real
  merchant-insights data (including multi-year merchants and the empty state), the sparkline and
  what-changed callout render correctly, and dark mode holds up.
