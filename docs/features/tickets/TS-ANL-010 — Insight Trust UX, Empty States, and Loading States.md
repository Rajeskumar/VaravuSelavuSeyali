**Status:** ✅ Built (web) — updated 2026-07-04 (see [FEATURE_STATUS.md](../FEATURE_STATUS.md))

Item Insights (web + mobile) has good empty states with actionable CTAs ("Upload a receipt to unlock...", "Add Receipt Expense" button) and skeleton loaders (`ListSkeleton`/`HeroSkeleton` on mobile, MUI `Skeleton` on web). AI Analyst has empty-state copy and a "Thinking..."/animated typing indicator on both platforms. On web: Merchant Insights now has an empty state with an "Add an Expense" CTA and copy nudging merchant-name entry; the Analysis page has a top-level "no expenses yet" state (skips rendering empty charts/tables); and both Item and Merchant Insights detail views have an "Ask AI about this item/merchant" CTA chip that deep-links into a pre-filled, auto-submitted AI Analyst question. Confidence/trust copy is now backed by the real `confidence` field (TS-ANL-009) rather than being purely cosmetic.

**Remaining gap:** this pass was web-only — mobile doesn't have the Merchant Insights empty state, Analysis empty state, or Ask AI CTAs yet.

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