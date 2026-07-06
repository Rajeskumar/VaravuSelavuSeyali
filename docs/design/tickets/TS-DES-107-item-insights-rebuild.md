# TS-DES-107 — Item Insights rebuild

**Initiative:** Reconcile UX Redesign · **Build order:** 4th (batch 2; no cross-team dependency, can go first) · **Spec:** `UX_Design_Spec.md` §4.4/§6, `UX_Audit_and_Redesign.md` §3 (item-level intelligence framing), `docs/design/prototypes/ItemInsights.jsx` · **Status:** 🔴 Not started

## Located before scoping, per instruction

Item Insights is **not** in the Groups Product Spec's page inventory and that doc's own freshness
note says analytics UI may have moved on since March 2026 — so this was verified against
`FEATURE_STATUS.md` and the live repo rather than assumed:

- `FEATURE_STATUS.md` §2 lists **TS-ANL-003 — Item Insights: ✅ Built**, web only, as a **dedicated
  page** — confirmed live: `varavu_selavu_ui/src/pages/ItemInsightsPage.tsx` (list view + detail
  view in one component, no separate route for detail — `?item=` query param deep-links into it).
  It is not a section inside `ExpenseAnalysisPage.tsx` and not a modal.
- Mobile has its own screen already: `varavu_selavu_mobile/src/screens/ItemInsightsScreen.tsx` —
  per `FEATURE_STATUS.md`, this round's redesign work was **web-only**; mobile "still reflects the
  prior state," meaning it wasn't restyled in the earlier Reconcile passes either (out of scope
  for this ticket unless a mobile pass is explicitly requested later — flagging, not building).
- Backend confirmed already built per the Feature Catalog: `item_insights`/`item_price_history`
  tables, `getTopItems`/`getItemDetail` in `varavu_selavu_ui/src/api/analytics.ts` calling the real
  `/analytics/items` endpoints. This is a genuinely self-contained UI rebuild — no backend
  dependency, no placeholder-data caveats needed anywhere in this ticket, unlike TS-DES-106/109.

## Scope

Replace `ItemInsightsPage.tsx`'s current structure — three `SummaryCard`s (Personal
Inflation/Biggest Increase/Most Frequent), a flat `List` of items with confidence/MoM chips, and a
detail view built from MUI `Table`s (Price Summary box, Store Comparison table, Price History
table) — with `ItemInsights.jsx`'s pattern: a clean ranked item list (name, purchase count, avg
price, total spent), and a detail view with `StatBlock`s (Avg/Lowest/Highest/Total, color-coded
jade/ember for low/high), an SVG price-history **line chart** (not a table) with per-point store
labels, **store comparison chips** (pill-shaped, cheapest store marked with a jade check), and a
monospace **receipt-tape** purchase history list (not a table) — reusing the receipt-tape
vernacular from Design Spec §4.4.

## Files it will touch

- `varavu_selavu_ui/src/pages/ItemInsightsPage.tsx` — list view restyled to the ranked-row pattern;
  detail view rebuilt per the components below. `getConfidence`/`monthSpan` helper functions and
  the confidence-chip logic stay (business logic, not visual) — only their presentation changes
  (e.g. the confidence chip's exact placement/style, not whether it's shown or how it's computed).
- **New components** under `varavu_selavu_ui/src/components/analysis/` (or a new `item-insights/`
  subfolder if these end up item-insights-specific and not reusable — confirm at implementation
  time; `PriceHistoryChart`/`PurchaseTape` are plausibly reusable by Merchant Insights (TS-DES-108)
  for its own item list, worth checking before duplicating):
  - `PriceHistoryChart.tsx` — SVG line chart per `ItemInsights.jsx`'s `PriceLine` (or a Plotly
    version using TS-DES-105's `chartTheme.ts` helpers for consistency with the rest of the app's
    charts — decide at implementation time; the prototype's hand-rolled SVG is simple enough that
    either is reasonable, but reusing the shared chart theme avoids a third charting approach in
    the codebase).
  - `StoreComparisonChips.tsx` — pill chips per `StoreChips`, cheapest store gets the jade
    check + tinted border treatment.
  - `PurchaseTape.tsx` — monospace, dashed-divider receipt-style list per `PurchaseTape`, reusing
    (or extracted alongside) whatever monospace font choice TS-DES-101 didn't already establish —
    confirm at implementation time whether a monospace font needs adding to `theme.ts`'s font
    loading (the reference prototype uses `'JetBrains Mono'`, loaded via the same Google Fonts
    `<link>` pattern TS-DES-101 used for Inter/Space Grotesk) or whether a system monospace stack
    (`ui-monospace, 'SF Mono', Menlo, monospace`) is good enough without a new font dependency.
- Existing `getTopItems`/`getItemDetail` API calls, `InsightScopeFilter`/`ScopeBadge` (TS-ANL-008)
  — untouched, this is a presentation-only rebuild of already-correct data-fetching.

## Acceptance criteria

- List view: ranked rows (name, purchase count + avg price, total spent), no more `List`/
  `ListItemButton`/MUI `Chip`-heavy row treatment — matches the prototype's plain row + chevron
  pattern used elsewhere in this redesign (`ExpenseFeed`, `GroupsScreen`).
- Detail view: `StatBlock`s for Avg/Lowest/Highest/Total (jade for lowest, ember for highest, per
  the money-color policy), a real line chart (not a table) for price history, store-comparison
  chips with the cheapest store visually marked, and a monospace receipt-tape purchase list (not
  a table) — all four replacing their MUI-`Table` equivalents.
- The existing "not enough data to compare stores" (fewer than 2 distinct merchants) and
  confidence-badge (TS-ANL-009) logic is preserved — this ticket restyles presentation, it doesn't
  remove trust/guardrail UX that already shipped.
- "Ask AI about this item" chip/deep-link to `/ai-analyst?q=...` still works (don't break the
  existing cross-link from TS-ANL-007).
- Dark mode verified.
- No backend or API-client changes.

## Dependencies

None. Self-contained — can start immediately, no ordering constraint against TS-DES-106/108/109/110.

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's approach.
- Manual verification: run the web app, confirm the list and detail views render correctly against
  real item-insights data (including the empty-state and low-confidence/insufficient-store-data
  paths), the price-history chart and purchase tape render correctly, and dark mode holds up.
