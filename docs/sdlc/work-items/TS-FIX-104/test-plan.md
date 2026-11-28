# Test specification

| Scenario ID | AC IDs | Action | Expected | Level / location |
|---|---|---|---|---|
| S1 | AC-001 | run-now and confirm with NaN, Infinity, 0, -1, 2000000, 12.345, text | refused, nothing stored or marked | tests/test_recurring_amount_limits.py |
| S2 | AC-002 | local qa/e2e URLs, remote and disguised URLs | only local accepted; scripts exit before connecting | scripts/quality/tests/test_qa_db_guard.py |
| S3 | AC-003 | repeat id, different payment, no id, unique-violation race | one row, one activity, one notification; 409 | tests/test_settlement_idempotency.py |
| S4 | AC-004 | success, unknown outcome then retry, definite refusal | same id only after unknown | web and mobile Jest settlementRequestId |
| S5 | AC-005 | settle a share | the expense is selected for update | tests/test_settlement_idempotency.py |
| S7 | AC-006 | settle, rename, change the amount or edit receipt items, settle again; delete the payment | 409, one row; settleable after delete | tests/test_settlement_share_after_edit.py |
| S8 | AC-005, AC-006 | eight settles at once; edit during a payment, payment during an edit, two edits at once, undo during an edit, on PostgreSQL | one payment; mark kept; no error | tests/test_settlement_pg.py |
| S9 | AC-007 | 409 and 400 from settle share | 409 refreshes; 400 does not | web and mobile settleShare tests |
| S10 | AC-005 to AC-007 | two tabs, rename, new total in a real browser on a local stack, old and new code | old stores two payments; new stores one | local browser run |
| S6 | AC-003 | upgrade, downgrade, upgrade on local PostgreSQL; two concurrent sends | one row | local rehearsal |
