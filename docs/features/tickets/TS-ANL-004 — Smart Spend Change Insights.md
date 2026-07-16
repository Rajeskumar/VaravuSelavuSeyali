**Status:** ✅ Built — updated 2026-07-04 (see [FEATURE_STATUS.md](../FEATURE_STATUS.md))

`GET /api/v1/analytics/changes` (`calculate_change_insights` in `insight_analytics_service.py`) now implements all 7 required insight types — biggest merchant increase/decrease, biggest category increase, biggest item price increase, new merchant detected, **unusual large transaction** (flagged against the user's own historical average, not just "biggest so far"), and **recurring bill increase** (compared against active `RecurringTemplate`s by description) — and supports all three comparison windows (month-over-month, year-over-year, custom-range). It's purely deterministic (no LLM), as required. Results are now ranked by relative magnitude (`abs(change_percent)`) before the top-5 cutoff, so the most eye-catching change wins a card slot regardless of type. `SmartChangeInsightsCard.tsx` renders the cards with drill-down links into Merchant/Item Insights and a comparison baseline.

### TS-ANL-004 — Smart Spend Change Insights

**Objective**  
Create insight cards and data services that explain what changed in a selected period across categories, merchants, and items, rather than only showing totals. This complements the current monthly trend and category totals already available in TrackSpense. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
Users do not just want totals; they want explanations. This feature should help them quickly understand why this month is higher or lower than another period. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Produce “what changed” insight outputs for a selected period compared to a previous comparable period:
  - biggest merchant increase,
  - biggest merchant decrease,
  - biggest category increase,
  - biggest item price increase,
  - new merchant detected,
  - unusual large transaction,
  - recurring bill increase if recurring pattern suggests higher cost. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Support comparison windows:
  - month vs previous month,
  - custom range vs previous equal-length range. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Generate summary cards and structured narratives, for example:
  - “Groceries increased mainly due to Costco and higher milk prices.”
- This story is analytical only; it should not depend on LLM generation for the primary output. The backend should produce structured causes that UI and AI can reuse. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Backend/API**
- Add structured change insight payloads, either under new insight endpoints or an extended summary endpoint.
- Inputs must support the same date scoping rules as current `/analysis` and chat requests. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**UX requirements**
- Show 3–5 high-value change insights, not a long noisy list.
- Each card should include:
  - title,
  - metric value,
  - comparison baseline,
  - drill-down link to merchant/item/category where applicable. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- Insight cards remain deterministic and explainable.
- A change insight must always reference actual scoped data, not AI inference alone.
- Users can navigate from a change insight to the related merchant or item detail screen. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)