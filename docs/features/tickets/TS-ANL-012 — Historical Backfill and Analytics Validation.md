**Status:** ✅ Built — verified 2026-07-04 (see [FEATURE_STATUS.md](../FEATURE_STATUS.md))

Correcting the previous "Pending" label — this is actually fully implemented. `scripts/backfill_insights.py` clears all insight tables, replays every existing expense (simple and itemized) through the aggregation service, and runs a validation pass comparing aggregated sums against source-of-truth `SUM(Expense.amount)`/`SUM(ExpenseItem.line_total)` with a $0.05 tolerance, printing pass/fail per check. Reprocessing is idempotent (tables are cleared before each replay). `tests/test_insight_analytics_service.py` covers the underlying aggregation math.

### TS-ANL-012 — Historical Backfill and Analytics Validation

**Objective**  
Backfill insights for existing users and validate that insight outputs match source expense data. Since TrackSpense already has users and stored receipt/item history, the feature must work for historical data and not only for newly created receipts. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Add a backfill path that scans existing expenses and expense items and populates merchant/item insight tables.
- Add validation checks:
  - merchant total_spent equals sum of eligible expenses in scope,
  - item total_spent equals sum of eligible item line totals,
  - no duplicate counting after reruns,
  - soft-deleted or excluded expenses are not counted. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Add operational logging/metrics sufficient for debugging backfill failures and mismatches. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- Historical users receive merchant insights immediately after backfill completes.
- Re-running backfill is safe and idempotent.
- Validation reports surface mismatches during development or testing. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)