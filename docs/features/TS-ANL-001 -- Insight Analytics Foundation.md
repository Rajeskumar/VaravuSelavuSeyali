# Insight Analytics Foundation

**Objective**  
Define the shared business rules, metric definitions, response contracts, and filtering behavior for the new insight analytics layer so all later merchant, item, and AI stories use the same semantics. This must extend the current analytics model, which already supports category totals, top categories, monthly trend, category drill-down, and date scoping. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
Users should see consistent numbers across dashboard insights, detail screens, and AI Analyst responses. The same merchant total or item trend should not vary depending on which screen they open. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Introduce a shared insight analytics domain model for:
  - merchant-level analytics,
  - item-level analytics,
  - change insights,
  - summary insight cards,
  - scoped filters by year, month, custom start/end date. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Preserve the current `/api/v1/analysis` endpoint and current `AnalysisResponse` behavior for category-based analytics. New insights must be additive and must not break existing web/mobile analysis pages or AI chat payload expectations. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Define canonical metric names and formulas:
  - total_spent,
  - transaction_count,
  - average_transaction_amount,
  - month_over_month_change_amount,
  - month_over_month_change_percent,
  - average_unit_price,
  - min_unit_price,
  - max_unit_price,
  - total_quantity_bought,
  - last_paid_price,
  - distinct_merchants_count,
  - first_seen_at,
  - last_seen_at. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Define data-source boundaries:
  - Merchant insights may use all expenses with a non-null merchant name. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
  - Item insights may only use expenses that have receipt-backed line items in `expense_items`. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
  - If an expense has no items, it must still count toward parent expense analytics and merchant spend if merchant exists. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Define filter precedence consistent with current analysis/chat behavior:
  - custom `start_date`/`end_date` overrides month/year,
  - otherwise use year/month,
  - otherwise default to all-time for insight screens unless the UI specifies a default window. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Define common sorting rules:
  - top merchants by total_spent desc,
  - top items by total_spent desc by default,
  - optional alternate sorts for transaction_count, quantity, unit price change, latest activity. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**UX requirements**
- All insight screens and cards must display the active time scope in a visible chip/header area.
- All percentages must indicate baseline, for example “vs previous month.”
- If a metric is not calculable due to insufficient history, the UI should show “Not enough data yet” instead of zero. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- A shared typed contract exists for merchant insight summary, merchant detail, item insight summary, item detail, and change insight payloads.
- The same date-scoping logic is used across web, mobile, and AI Analyst retrieval paths.
- Existing `/analysis` responses remain unchanged for current consumers.