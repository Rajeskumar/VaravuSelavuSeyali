# TS-DES-106 — Expense Analysis rebuild

**Initiative:** Reconcile UX Redesign · **Build order:** 4th (batch 2; no dependency on 107/108/110) · **Spec:** `UX_Design_Spec.md` §4.2/§4.3/§4.6/§6, `UX_Audit_and_Redesign.md` §3.4/§6, `docs/design/prototypes/ExpenseAnalysis.jsx` · **Status:** 🔴 Not started

## Scope

Replace `varavu_selavu_ui/src/pages/ExpenseAnalysisPage.tsx`'s current structure — a sidebar
Filters panel (Year/Overall-Year/Month/Scope), a Summary + "What Changed" card row, a Top
Categories bar chart, a Category Breakdown table, `MoneyFlowSankey` (TS-DES-105), and a
conditionally-shown Monthly Trend line chart — with the pattern in `ExpenseAnalysis.jsx`: a compact
lens switch, a 6-month trend line that doubles as a tappable month navigator, a "what changed"
tile rail (horizontally scrollable, sentence-first, each with an "Ask why →" action), a ranked
category spectrum with expandable rows (tap a category to reveal its transactions inline, no
separate drill-down page), and a summonable "Ask" bottom sheet for the insight tiles' follow-up
questions.

**Correcting the ticket's own premise against the current code, not just the reference:**
`ExpenseAnalysisPage.tsx` does **not** currently lead with a donut — TS-DES-105 already confirmed
and documented this (its own implementation notes: *"`ExpenseAnalysisPage.tsx` never had a donut
leading it... already used a ranked `CategorySummaryTable.tsx` + bar chart"*). The real gap is
structural in a different way: today's category view is a flat table with a `%-of-income` column
(no expand/collapse, no inline transactions), the "what changed" card
(`SmartChangeInsightsCard.tsx`) is a single card, not a tile rail with per-insight "Ask why," the
trend line only appears in Overall-Year mode instead of always being present as a month-tappable
navigator, and there is no lens control at all (My Expenses / I Paid / Group Total) — this ticket
adds all four, not "replace a donut."

**Two dependencies flagged rather than built around — build the UI now, cosmetic-only until each lands:**

1. **The lens switch (My Expenses / I Paid / Group Total) is only functionally meaningful once
   Groups' three-money-views data model reaches category-level granularity.** Today,
   `AnalysisResponse.category_totals`/`category_expense_details` are single flat numbers — there is
   no per-category `my_share`/`i_paid`/`group_total` split the way `TrueTotalHero` (TS-DES-103) gets
   at the *headline* level from `spend_breakdown`/`group_summaries`. Build the lens control now
   (reuse `SegmentedTabs`, same pattern as `TrueTotalHero`), wire it to re-fetch/relabel using
   whatever scope data exists today (effectively aliasing it to the existing personal/groups/combined
   `AnalysisScope` filter currently driven by `GroupScopeFilter` in the sidebar), and leave a clearly
   marked TODO for swapping in true per-category three-money-view splits once that backend work
   lands. Do not block this ticket on it.
2. **The "Ask why" inline sheet needs real, scoped answers from the AI Analyst backend to be more
   than a UI shell.** Per `FEATURE_STATUS.md`, TS-ANL-005 is marked ✅ **already built** — but as a
   LangGraph tool-calling agent (`chat_service.py`, 3 tools), not the free-text-question →
   pre-computed-answer pattern the prototype's `AskSheet` demos (which is itself just a scripted
   800ms-delay mock, not a real integration point). There is no existing endpoint that takes "why
   did dining go up 32%" and returns a scoped, cited answer the way the mock does — the closest real
   thing is `POST /analysis/chat`, which is a general chat endpoint, not an insight-specific one.
   Build the `AskSheet` UI now (bottom sheet on mobile widths, matching the prototype's message-list
   + follow-up input), wire its initial question through to `POST /analysis/chat` for a real (if
   generic, un-cited) answer instead of a scripted placeholder, and note in the component that a
   dedicated "explain this insight" endpoint/prompt-shaping is a real backend gap, not a "coming
   soon" — the chat endpoint already exists and works, it just isn't insight-aware the way the
   prototype's canned answers imply.

## Files it will touch

- `varavu_selavu_ui/src/pages/ExpenseAnalysisPage.tsx` — restructured per the above. The sidebar
  Filters `Paper` (Year/Overall-Year/Month/`GroupScopeFilter`) is replaced by the lens switch +
  trend-line-as-navigator combo; year/month selection moves from an explicit dropdown pair to
  "tap a month in the trend line" (matching the prototype), with the dropdown pair kept as a
  secondary/overflow control for jumping to months outside the visible 6-month window (the
  prototype doesn't need this since it's a fixed demo dataset, but a real app needs a way to reach
  January from a view that defaults to showing the last 6 months).
- **New components** under `varavu_selavu_ui/src/components/analysis/`:
  - `AnalysisLensSwitch.tsx` — thin wrapper around `SegmentedTabs` for My Expenses/I Paid/Group
    Total, following the placeholder-data caveat above.
  - `TrendNavigator.tsx` — the 6-month bar/line hybrid from `TrendBars` in the prototype, tappable,
    replacing the always-hidden-unless-overallYear `MonthlyTrendLineChart` placement (that
    component itself, from TS-DES-105, may still back the Overall-Year case or be retired here —
    confirm at implementation time whether both are needed or this one subsumes it).
  - `WhatChangedRail.tsx` — horizontally-scrollable insight tiles wrapping the existing
    `SmartChangeInsightsCard`'s data source, restyled per the prototype's `InsightTile` (sparkline +
    headline + "Ask why →"), replacing the single-card presentation.
  - `CategorySpectrum.tsx` — expandable ranked category rows (tap to reveal inline transactions),
    replacing `CategorySummaryTable.tsx`'s flat `%`-of-income table. Confirm whether
    `CategorySummaryTable` is used elsewhere before deleting it outright (it wasn't in TS-DES-105's
    touch list, so check for other consumers first).
  - `AskSheet.tsx` — the bottom-sheet chat surface described above, reusable by any insight tile's
    "Ask why"/"Ask about it" action.
- Existing components this ticket restyles in place rather than replaces: `MoneyFlowSankey.tsx`
  (TS-DES-105, web-only signature view — keep as-is, it already matches Reconcile tokens),
  `ExpenseSummaryCards.tsx` (confirm still needed once the lens switch exists, or fold into it).

## Acceptance criteria

- No donut-shaped confusion to correct (there wasn't one) — but the flat `%`-of-income category
  table is gone, replaced by expandable ranked rows matching `ExpenseAnalysis.jsx`'s
  `CategoryRow`/spectrum bar treatment.
- A 6-month trend navigator is always visible (not gated behind "Overall Year"), tapping a month
  updates the whole page's scope, matching the prototype's `TrendBars` behavior; a way to reach
  months outside the visible 6 still exists (secondary control, not removed outright).
- A "what changed" tile rail renders above the category spectrum, sourced from the existing
  smart-change-insights data, each tile offering an "Ask why"/"Ask about it" action that opens
  `AskSheet`.
- The lens switch (My Expenses/I Paid/Group Total) renders and is interactive, but is explicitly
  documented (code comment + this ticket's implementation notes once built) as operating on
  today's scope data only until per-category three-money-view splits exist server-side — no fake
  data invented to make it look more functional than it is.
- `AskSheet` opens, sends the tile's seed question to the real `POST /analysis/chat` endpoint, and
  shows a real (if generic) response — not a scripted 800ms-delay placeholder like the prototype.
- Dark mode verified.
- No backend endpoint changes in this ticket — everything above works against `GET /analysis` and
  `POST /analysis/chat` as they exist today.

## Dependencies

- **TS-DES-101** (tokens), **TS-DES-105** (chart theme helpers, `MoneyFlowSankey` — both already
  land in the working tree and this ticket builds on them, not around them).
- **Partially gated, not blocking (see the two flagged items above):** Groups per-category
  three-money-view data (in-flight, `TS-GRP-*`/Groups Product Spec territory — out of this
  redesign's control) for the lens switch's real functionality; a dedicated insight-explanation
  backend shaping (not yet scoped anywhere) for `AskSheet`'s answers to be scoped/cited rather than
  generic chat responses.

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's approach.
- Manual verification: run the web app, confirm the trend navigator/lens/category spectrum/what-changed
  rail all render and interact correctly against real analysis data, `AskSheet` round-trips a real
  chat response, dark mode holds up, and the existing Sankey/summary cards still render correctly
  alongside the new layout.
