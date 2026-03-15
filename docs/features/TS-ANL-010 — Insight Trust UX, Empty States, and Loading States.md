### TS-ANL-010 — Insight Trust UX, Empty States, and Loading States

**Objective**  
Design trustworthy user-facing states for cases where data is incomplete, processing is ongoing, or insights are not yet available. This is important because TrackSpense already has receipt parsing, analytics, and AI workflows where processing and data availability vary.

**Requirements**
- Add explicit empty states for:
  - no expenses yet,
  - no merchant data,
  - no receipt-backed item data,
  - insufficient history for trends,
  - insight processing in progress.
- Add loading/skeleton states consistent with current mobile shared component patterns and current web design system. Mobile already has a `SkeletonLoader` component; reuse or extend similar patterns.
- Add explanatory copy for price comparisons and trend confidence.
- Add drill-forward CTAs:
  - “Upload a receipt to unlock item insights,”
  - “Add merchant name to improve merchant insights,”
  - “Ask AI about this merchant.”

**Acceptance criteria**
- No insight screen appears broken or blank when data is missing.
- Empty states encourage user action and align with existing TrackSpense feature set.