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