### TS-ANL-002 — Merchant Insights

**Objective**  
Add merchant-level insight analytics that explain where users spend money, how spending changes over time by merchant, and what they typically buy at each merchant. This is a direct extension of current expense storage because expenses already store `merchant_name` and overall amount. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
A user should be able to answer:
- Which merchants do I spend the most at?
- How much did I spend at Costco this month or this year?
- Which merchant increased the most?
- What do I usually buy at that merchant? [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Add a merchant insights feature with:
  - top merchants list,
  - merchant ranking,
  - merchant spend trend,
  - merchant detail page/screen,
  - merchant item summary where item data exists. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Merchant summary metrics per merchant:
  - merchant_name,
  - total_spent,
  - transaction_count,
  - average_transaction_amount,
  - last_transaction_at,
  - first_transaction_at,
  - month_over_month_delta,
  - top_categories,
  - optional top_items if item history exists. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Merchant detail metrics:
  - monthly spend time series,
  - yearly spend rollup,
  - recent transactions list,
  - items purchased at this merchant,
  - average basket amount,
  - highest single transaction,
  - spend share of total user expenses within selected period. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Define merchant matching rules:
  - use canonical merchant name if available,
  - otherwise use stored `merchant_name`,
  - merchant insight records must remain user-scoped and never cross users. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Backend/API**
- Add `GET /api/v1/analytics/merchants`
  - supports `year`, `month`, `start_date`, `end_date`, `limit`, `offset`, `sort_by`, `sort_dir`.
- Add `GET /api/v1/analytics/merchants/{merchant_name}`
  - returns merchant detail with trend and recent transactions.
- Response format must follow the common API style and existing authenticated `/api/v1/*` conventions. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Web UX**
- Add a new authenticated route such as `/insights/merchants`.
- Page layout:
  - header with title and active date range,
  - summary cards for top merchant, total merchant spend, biggest riser,
  - merchant list/table/cards,
  - click into merchant detail page. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Merchant detail page should include:
  - line/bar chart for monthly spend,
  - KPI cards,
  - recent transactions,
  - frequently purchased items section when item data exists. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Mobile UX**
- Add Merchant Insights entry point under the authenticated app shell, preferably through drawer or analysis-area navigation so it fits the current navigation model without displacing existing tabs. Current bottom tabs are already Home, History, Add, Stats, and AI Chat. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Merchant summary screen should support scrollable cards/list.
- Merchant detail screen should support chart, KPI cards, recent transactions, and top items. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- Merchant insights work for manually entered expenses and receipt expenses as long as `merchant_name` exists.
- Totals match current expense records for the selected period.
- Merchant details do not require itemized receipt data to render the core experience. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
