**Status:** ✅ Built (web) — updated 2026-07-04 (see [FEATURE_STATUS.md](../FEATURE_STATUS.md))

Year/month filters exist and are reactive on both Item and Merchant Insights (web + mobile); the backend supports `start_date`/`end_date` on all relevant endpoints. Web now has a shared `InsightScopeFilter` component with a Month/Custom-range toggle and native date pickers, a `ScopeBadge` showing the active scope on both list and detail headers, and detail pages now pass the list page's active filter through instead of always showing all-time data. Also fixed a live bug in `get_item_detail`/`get_merchant_detail`: both required a `user_id` query param the frontend never sent (silent 422 on every click) — now derived from the auth token, matching every other analytics route.

**Remaining gap:** this pass was web-only — mobile still only has year/month filters, no custom range or scope badge.

### TS-ANL-008 — Insight Filters and Time Scoping

**Objective**  
Provide a shared filtering experience across insight screens and AI retrieval so users can switch periods confidently and compare results consistently. Current TrackSpense already supports year/month and custom date range filtering in analysis and date-scoped chat.

**Requirements**
- Shared filters:
  - year,
  - month,
  - custom start/end date,
  - optional sort and ranking controls on list views.
- Filters must be reflected consistently in:
  - Merchant Insights summary and detail,
  - Item Insights summary and detail,
  - Smart Change Insights,
  - AI chat retrieval for merchant/item queries.
- Preserve current date input conventions accepted by backend where applicable.

**UX requirements**
- Filter controls should visually match the existing analysis/dashboard aesthetic on web and existing themed mobile components on mobile. Current design system uses MUI on web and themed shared components on mobile.
- Current active scope should appear in page header and detail views.

**Acceptance criteria**
- Changing filters updates metrics, charts, lists, and drill-down links consistently.
- A merchant detail opened from a filtered summary page inherits the same date scope by default.