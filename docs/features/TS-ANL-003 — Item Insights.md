### TS-ANL-003 — Item Insights

**Objective**  
Add item-level insight analytics powered by receipt line items so users can understand what they buy most often, how prices change over time, and where they personally got the best price. This builds directly on the existing `expense_items` model, which already stores item name, normalized name, quantity, unit, unit price, line total, and user scoping. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
A user should be able to answer:
- What items do I buy most often?
- What is my average price for milk?
- Which store was cheapest for eggs?
- Is this item getting more expensive over time? [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Add item insights feature with:
  - top purchased items list,
  - item ranking,
  - item detail screen,
  - price history chart,
  - merchant/store comparison for the item,
  - quantity and spend summary. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Item summary metrics:
  - normalized_name,
  - display_name,
  - total_spent,
  - total_quantity_bought,
  - purchase_count,
  - average_unit_price,
  - min_unit_price,
  - max_unit_price,
  - last_paid_price,
  - distinct_merchants_count,
  - last_purchased_at. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Item detail metrics:
  - historical purchases list,
  - price-over-time series,
  - merchant comparison matrix,
  - average monthly spend on this item,
  - purchase frequency,
  - optional personal inflation delta over trailing periods. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Data quality rules**
- Item insights must use `normalized_name` when available.
- If `normalized_name` is missing, fallback to a safe derived display key from raw `item_name`, but such rows must be marked lower confidence.
- Store comparisons should only be shown when there are at least two purchases of the item across at least two distinct merchants and sufficient unit-price comparability. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- If unit normalization is weak or mixed, price history can still show raw paid price, but “cheapest store” claims must be suppressed unless comparable. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Backend/API**
- Add `GET /api/v1/analytics/items`
  - supports filters, sorting, pagination.
- Add `GET /api/v1/analytics/items/{item_name}`
  - returns item detail, price history, merchant comparison, recent purchase events.
- The detail endpoint should support querying by canonical normalized name key, not arbitrary fuzzy matching only. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Web UX**
- Add `/insights/items` route.
- Summary page sections:
  - top items,
  - biggest price increases,
  - most frequently bought items,
  - recently rising staples. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Item detail page sections:
  - header with item name and confidence badge if needed,
  - line chart for price history,
  - merchant comparison card/list,
  - recent purchase timeline,
  - AI prompt suggestions like “Ask AI why this item became expensive.” [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Mobile UX**
- Add Item Insights screen accessible alongside Merchant Insights from the authenticated experience.
- Item detail screen should prioritize:
  - price chart,
  - cheapest merchant card,
  - last paid price,
  - recent purchases,
  - concise copy due to mobile screen size. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- Item insights render only from eligible itemized receipt data.
- No UI claim should imply perfect price comparability when unit or normalization quality is uncertain.
- Existing receipt flow and expense confirmation behavior remain unchanged. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)