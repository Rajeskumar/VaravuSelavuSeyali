# Acceptance verification — TS-FIX-102

Recorded 2026-11-26 on the local tree (not CI).

| AC | Verified by | Result |
|---|---|---|
| AC-001 | S-01..S-04 (`test_receipt_split_by_total.py`), `test_a_receipt_moved_to_a_group_is_split_on_its_total_only`, web `useLogExpense.test.tsx`, `ExpenseDetailSheet.test.tsx` (split types), Playwright group receipt (equal shares 9.00 ×3) | Pass |
| AC-002 | S-12 (`member_ratios` incl. `{}` and coupon lines → 400 `app_update_required`, nothing written), suggest route 404, payload tests (no `member_ratios`) web + mobile | Pass |
| AC-003 | `test_receipt_lines.py` (fold, divide by price, free item, refunds, no negatives, unreadable numbers), S-10/S-11, `test_receipt_ingestion` `_finalize`, MCP fold test, web + mobile card tests (paid price, saving, no minus) | Pass |
| AC-004 | Totals rule tests on personal create/PUT (incl. tip), group create/PUT/items, personal plain edit, MCP verify/save/`accept_unreconciled`/subtotal; clients block Save (web + mobile tests, Playwright "blocks Save until fixed") | Pass |
| AC-005 | S-08 (70/30 kept, assignment rows kept), S-13 (`split_required`), S-14..S-16 (converted on read, saved once), lost-tax and moved-legacy receipts stay editable, migration rehearsal (old rows NULL) | Pass |
| AC-006 | S-17/S-18 (shares-based item insights, paid unit price), edit-then-delete back-out test, refund review (S-20) | Pass |

Not verified here: native iOS/Android (Maestro) and real-device scans (release time); Firefox/WebKit Playwright; production data shape (needs a read-only query and separate approval).
