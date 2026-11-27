# Test specification

Requirements: requirements.md; acceptance-criterion text: work-item.json. Plan: implementation.md.
Backend tests pin the clock (`PINNED_TODAY`); money compared as `Decimal`. "Red first" = must fail on the current code
before the fix and be recorded in `red-green` evidence.

| Scenario ID | AC IDs | Preconditions / fixture | Action | Expected outcome | Level / location |
|---|---|---|---|---|---|
| S-01 | AC-001, AC-004 | Group, 3 members; lines 10.00+20.00, tax 3.34, amount 33.34 | POST itemized, split equal | 201; shares 11.12/11.11/11.11 = 33.34; split_type `equal`; tax/tip stored; no `expense_item_splits` rows | pytest API `test_group_receipts.py` |
| S-02 | AC-001 | Same group | POST with split exact (sums to amount) and shares 2:1 | Shares equal amount to the cent; exact not summing → 400 | pytest API |
| S-03 | AC-001 | Same group | POST receipt with split percentage, then adjustment | 400 for both; manual `POST /expenses` with percentage/adjustment still 201 | pytest API |
| S-04 | AC-001, AC-004 | Amount 100, one 10.00 line (the P0) | POST | 400 totals do not match (red first: today 201 with 5.01+5.01) | pytest API |
| S-05 | AC-003 | Parsed lines: Milk 10.00, coupon −2.00 | `normalize_scan` | One line: paid 8.00, discount 2.00, original 10.00; no negative values | pytest unit `test_receipt_lines.py` |
| S-06 | AC-003 | Header discount 3.00; lines 10.00, 20.00 | normalize | Paid 9.00/18.00, discounts 1.00/2.00, header discount 0; cent-exact on uneven splits (e.g. 1.00 over 3 lines) | pytest unit |
| S-07 | AC-003 | Coupon as first line; coupon larger than line above (5.00 under a 3.00 line); free item 0.00; parser negative "Receipt adjustment" | normalize | Divided by price; no line < 0.00; free item stays 0.00; adjustment treated as discount with warning | pytest unit + parser test |
| S-08 | AC-005 | Old item-split group receipt (split_type itemized, 70/30 via assignment rows) | PUT items renaming a line, same amount | Payers, shares and split_type unchanged; renamed line keeps its assignment rows (red first: today becomes 50/50) | pytest API `test_group_expense_items_edit` |
| S-09 | AC-004 | Personal receipt lines 40.00, tax 3.20, tip 8.00, amount 51.20 | POST with-items; PUT items with tip | Both succeed; tip stored; PUT without tip → 400 (red first for PUT: tip field absent today) | pytest API |
| S-10 | AC-003, AC-004 | Personal create, header discount 2.00 | POST | 400 `app_update_required`; line discount 2.00 with paid line → 201 and `expenses.discount` = 2.00, never subtracted | pytest API |
| S-11 | AC-003 | Line with discount 2.00, paid 8.00 | save without original_price; with original_price 10.00; with 12.00 | Stored original 10.00; 10.00 ok; 12.00 → 400; negative line_total or discount → 422 | pytest API |
| S-12 | AC-002 | Any client payload with `member_ratios` on an item (including `{}`) | POST group itemized | 400 `app_update_required` with the update message; nothing written; `GET .../items/suggest_assignment` → 404 | pytest API |
| S-13 | AC-005 | Old item-split receipt; new Exact receipt; new Equal receipt | PUT items with a changed amount, no split; then with split equal | Old and Exact → 400 `split_required`; Equal re-splits cent-exact; with split → saved, split_type equal | pytest API |
| S-14 | AC-005 | Old-format personal receipt: lines 10.00+20.00, header discount 3.00, amount 27.00, original_price NULL | GET items | Lines 9.00/18.00, discounts recorded, `legacy_discount_format: true`; DB unchanged after GET | pytest API |
| S-15 | AC-005 | Same, then PUT the converted lines | PUT | Saved once, total 27.00, original_price set; GET now `legacy_discount_format: false`; resaving gives the same numbers (no second discount) | pytest API |
| S-16 | AC-005 | Old group receipt with per-line discounts | GET + PUT same amount | Converted lines shown; shares unchanged | pytest API |
| S-17 | AC-006 | Group receipt equal split, 2 members, 8.00 milk (10.00 before coupon) | create, then delete | Each member's item insight gets 4.00 paid and unit price 8.00 paid; delete backs it out to zero; old receipt delete uses assignment rows | pytest service |
| S-18 | AC-006 | Personal receipt 2 @ 5.00 with a 2.00 coupon | save; read price history | Unit price 4.00 (paid), not 5.00 | pytest service |
| S-19 | AC-003, AC-004 | MCP verify itemized with header discount 2.00; with `accept_unreconciled: true` on a non-matching receipt; old pending op that no longer matches | verify / save | Discount folded into lines on the approval preview; accept_unreconciled refused `totals_mismatch`; stale op refused on save | pytest `test_mcp.py`, `test_mcp_pg.py` |
| S-20 | AC-006 | Lines "RETURN SHIRT −15.00", "BOTTLE DEPOSIT REFUND −0.10", AI item `is_refund: true` | normalize | Not folded; listed in `review` with a warning; items contain no negative line | pytest unit |
| S-21 | AC-001, AC-002 | Web/mobile Quick Capture, group selected, scanned receipt | render; pick Exact, Shares; save | No per-item assignment UI; split options Equal (default)/Exact/Shares only; payload has `split`, header tax/tip, no `member_ratios`, no first-item tax | vitest `QuickCaptureSheet`/`useLogExpense`; jest `AddExpenseScreen` |
| S-22 | AC-003, AC-004 | ScannedItemsCard with coupon-folded line, tip, refund review line | render; edit original price; break totals | Paid price shown with "saved 2.00"; original price editable incl. empty; tip row; review list shown; Save disabled with the difference while totals differ by > 0.02 | vitest + jest component tests |
| S-23 | AC-005 | Item edit screens with `legacy_discount_format: true`; server answers `split_required` | open edit; change amount; save | Banner "Prices were adjusted…"; Equal/Exact/Shares picker on `split_required`; `app_update_required` message shown verbatim | vitest `ExpenseDetailSheet`/`ExpenseDetailDialog`; jest `ExpenseItemsViewSheet`/`EditGroupExpenseModal` |
| S-24 | AC-001 | Group receipt (`has_items`) and manual group expense | open group edit split editor | Receipt hides Percentage/Adjustment; manual shows all five | vitest + jest |
| S-25 | AC-001, AC-003, AC-004 | Local stack, mock receipt engine with a coupon line | Playwright: scan, save to group with Equal, open details | Line shows paid price; shares equal amount; mismatched total blocks save | `qa/e2e/tests/expenses/receipt-scan.spec.ts` |
| S-26 | AC-001, AC-002 | Simulator/emulator e2e variant | Maestro receipt flow (if it covers group receipts) | No assignment step; save with Equal succeeds | `qa/mobile` (release time) |
| S-27 | all | Migration on local Postgres from current head | `alembic upgrade head`, downgrade, upgrade | Column added nullable, no data change; downgrade drops it | `make migration-rehearsal` |

Manual checks (native device, release time): scan a real grocery receipt with a coupon and a restaurant receipt with a
tip on one iPhone and one Android device; expected: paid prices, tip kept, Equal split default for a group.
