# Requirement agreement

Status: agreed with the owner in conversation, 2026-11-26. Owner and acceptance criteria: work-item.json. Plan and test
specification are NOT written yet: do Plan first and get the owner's approval of it (high risk).

## Problem and users
- Pre-existing P0: group itemized create does not require items to reconcile with the amount. In the engine, amount 100 with one
  10.00 item shared by two gives 5.01 + 5.01. Amount 11 with a 10.00 item and no tax gives shares totalling 10.02.
- Receipt scans record coupons as negative lines, which conflicts with the owner's "no minus values" rule (TS-FIX-101 left
  scanned `line_total` and `unit_price` signed as a temporary exception; this item removes that exception).
- TS-FIX-101 finding N-4 and the ROADMAP "Release test coverage" section hold the details.

## Outcome and scope (agreed)
1. Items are for tracking and analysis only. A group receipt is split on its TOTAL: Equal (default for grocery and restaurant
   bills), Exact or Shares. This restriction applies to RECEIPTS ONLY; manually entered group expenses keep Percentage and
   Adjustment too.
2. Item-by-item assignment is removed from web, mobile and the server, including assignment suggestions. A request that still
   sends item assignments is rejected with a clear message to update; it never silently changes who owes what.
3. Each line keeps original price, discount and paid price. The line shows the PAID price. Discounts are a record only and are
   never subtracted again. Example: 10.00 with a 2.00 coupon is one 8.00 line, saved 2.00. No negative lines anywhere.
4. A whole-receipt discount is divided across lines by price (tracking only). An unclear coupon applies to the line above; with
   no line above, or when larger than that line, it is divided by price. A free item is 0.00. The user can correct prices,
   including an original price the scanner could not read.
5. Paid line prices + tax + tip must match the receipt total within 0.02, or the save is refused (server and clients). Tax,
   tip and prices are kept so item history and pricing are reliable; scanned tips must not be lost. Group receipt items have
   no tip field today.
6. Older item-split receipts keep their saved shares while the amount is unchanged, including item-detail edits; a changed
   amount asks for Equal, Exact or Shares. Old assignment records are not deleted. Receipts in the old discount format show
   adjusted line prices to check when edited; identify that format reliably so nothing is discounted twice. Other stored data
   is left unchanged.
7. Price history uses the paid price.
8. Returns and deposit refunds are not discounts: flag them for review. Full refund support is out of scope.

## Known impact (read in code; verify in Plan)
Discount is subtracted today in: `api/routes.py` (personal create and item update), `group_expense_service.py`,
`item_split_engine.py`, `expense_write_service.reconcile_receipt_totals`, `mcp/operations.py` and `mcp/schemas.py` (external
contract), `receipt_text_parser.py`, both AI prompts in `receipt_service.py`, web `ScannedItemsCard`/`AddExpenseForm`, mobile
`ScannedItemsCard`. Web Quick Capture (`useLogExpense`) and mobile `AddExpenseScreen` send tax and discount on the first item.
The `AddExpenseForm` group-receipt path omits tax and tip and appeared unreachable (the form only opens for editing). Web and
backend ship together; installed test builds and connected assistants must move to the new format.

## Decisions and open questions
Owner: "the line item should show the amount with discounted price"; "grocery bill will be split equally and also the
restaurant bill ... only the total amount"; "Option 1 is good" (receipts only); agreed on totals "to keep prices, tax and tip so
that item history can be reliable". Production data checks need a read-only query shown to the owner and separate approval.
Open for Plan: where original price and tip are stored (a migration needs its own approval before running anywhere non-local).
