### TS-ANL-006 — Expense Save-Time Aggregation Pipeline

**Objective**  
Create the save-time analytics pipeline that pre-calculates and updates merchant and item insight data whenever eligible expenses are created or updated. This matches the roadmap direction that insight data should be aggregated at expense save time rather than fully recalculated on every screen load. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
Insight screens and AI retrieval become fast, scalable, and cheap because data is already aggregated. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Trigger aggregation when:
  - `POST /expenses`,
  - `POST /expenses/with_items`,
  - `PUT /expenses/{row_id}`,
  - `DELETE /expenses/{row_id}` if deletes are soft, the analytics view must exclude deleted data. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Merchant aggregation should update from all eligible expenses.
- Item aggregation should update from receipt-backed line items.
- Support recomputation/backfill for historical data so existing users get insights without re-uploading receipts.
- Implementation may be sync or async, but must not degrade current expense-save UX unreasonably. For large receipt saves, async processing is preferable. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Data model**
- Introduce new user-scoped aggregate/history tables for:
  - merchant insights,
  - merchant period aggregates,
  - item insights,
  - item price history,
  - optional merchant-item relationship data. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Must remain inside the `trackspense` schema, consistent with current DB design. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- Newly created eligible expenses become visible in insight APIs after processing.
- Historical backfill job can compute aggregates from existing expenses and `expense_items`.
- Reprocessing is idempotent and does not double-count rows. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)