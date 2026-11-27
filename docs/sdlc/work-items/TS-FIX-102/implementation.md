# Implementation plan

Status: proposed, waiting for owner approval (high risk). Requirements: requirements.md; AC text: work-item.json.
Test specification: test-plan.md.

## What the code does today (Known impact, checked 2026-11-26)
The known-impact list is correct. Findings from reading the code, beyond that list:
- **K1 Item edits change money today.** Group `update_items` (`group_expense_service.py`) deletes payers, splits and
  assignment rows and splits every line equally across the people assigned to items, even when the amount is unchanged.
  A receipt split 70/30 becomes 50/50 when someone renames a line. Requirement 6 forbids this.
- **K2 Scanned tips are lost on web.** `useLogExpense.logPersonalWithItems` sends `tip: 0`; the group path has no tip.
  A restaurant scan with a tip then fails "Totals do not reconcile" or drops the tip.
- **K3 Personal item edits have no tip.** `ItemsUpdateRequest` has no `tip`, so a receipt with a tip cannot be edited.
- **K4 Clients spot receipts by `split_type == "itemized"`** (web `ExpenseDetailDialog`, mobile `EditGroupExpenseModal`).
  Once receipts are split Equal/Exact/Shares, they need a separate `has_items` flag.
- **K5 Group per-person item analytics read `expense_item_splits`** (`_get_itemized_email_shares`, used on create and
  delete), so they need a new basis once item assignment is gone.
- **K6 All scan sources (AI, server OCR, on-device OCR, mock) pass through `ReceiptService._finalize`**, so one function
  there can turn every scan into the new format.
- **K7 MCP items already treat `line_total` as the paid price** (`qty × unit_price − discount = line_total`); only the
  header `discount` is subtracted again. MCP also has `accept_unreconciled`, which lets a non-matching receipt save.
- **K8 Web `AddExpenseForm` group-receipt path cannot be reached** (the dialog opens only for editing, and the
  Personal/Group toggle is hidden when editing). It is the only web user of `ItemSplitBoard`.
- Group receipt rows already have `expenses.tax` and `expenses.tip` columns (shared `expenses` table); they are unused.

## Architecture and contracts

### Line format (all receipt paths)
| Field | Meaning (new) |
|---|---|
| `line_total` | **paid** price for the line, ≥ 0. Shown in every list. |
| `discount` | money saved on the line, ≥ 0. A record only; never subtracted again. |
| `original_price` *(new, optional)* | price before discount. Server sets it to `line_total + discount` when omitted; if both are sent they must agree within 0.01 (or `original_price` must be ≥ `line_total` when `discount` is omitted, then `discount` is derived). |
| `unit_price` | paid price per unit. When a discount is folded in, it is recomputed as `line_total / quantity`. Price history (`ItemInsight`, analytics) keeps reading it, so it becomes paid price (AC-006). |

Totals rule (AC-004), same helper everywhere: `abs(sum(line_total) + tax + tip − amount) ≤ 0.02`, no discount term.
Request header `discount` must be 0 or absent; a non-zero value is refused with the update message (old format). The
stored `expenses.discount` becomes the sum of line discounts (a record of savings).

### One normalizer (new pure module `services/receipt_lines.py`)
`normalize_scan(header, items) -> (header, items, review)`, applied in `ReceiptService._finalize` (K6) and to MCP verify:
1. A negative or coupon line is folded into the line above (its `line_total` drops, `discount` rises). With no line
   above, or when it is larger than that line, it is divided across all lines by price.
2. Header `discount` is divided across lines by price, cent-exact (largest remainder), and then set to 0.
3. Returns and deposit refunds (label match: return, refund, rtn, deposit refund, bottle return, plus an `is_refund`
   flag the AI prompts are asked to set) are **not** folded: they leave the item list and go to `review` with a warning.
4. The parser's negative "Receipt adjustment" balancing line is treated as an unclear discount (step 1's fallback).
5. A line is never below 0.00 (free item = 0.00); no negative values leave the function.
6. Legacy conversion: the same function turns a saved old-format receipt into new-format lines for editing.

The text parser and both AI prompts stay largely as they are (they may still emit negative coupon lines); the prompts
gain the `is_refund` flag and stop telling the model that line totals may be negative after normalization.

### Old-format detection (requirement 6, "reliably")
New migration adds nullable `expense_items.original_price NUMERIC(12,2)`. Every write after this change sets it on every
line. So: **an expense whose lines have `original_price IS NULL` was saved in the old format.** If it also has a
discount (expense or line), `GET .../items` returns the lines already converted by the normalizer plus
`legacy_discount_format: true`; clients show "Prices were adjusted for discounts. Check them before saving." Saving
writes the new format, so nothing can be discounted twice. Reading alone changes nothing. Old rows are never backfilled.

### Group receipt contract (`POST /groups/{id}/expenses/itemized`)
```json
{ "date": "11/20/2026", "description": "Costco", "category": "Groceries", "amount": "52.10",
  "payers": [{"member_id": "m1", "amount_paid": "52.10"}],
  "split": {"type": "equal", "entries": [{"member_id": "m1"}, {"member_id": "m2"}]},
  "tax": "2.10", "tip": "0.00",
  "items": [{"line_no": 1, "item_name": "Milk", "line_total": "8.00", "discount": "2.00", "original_price": "10.00"}] }
```
- `split.type` must be equal, exact or shares; percentage/adjustment → 400. Shares come from the existing
  `split_engine.resolve_split`, so they equal the amount to the cent (AC-001). `item_split_engine` is deleted.
- Any item carrying `member_ratios` (even `{}`, which every current client sends) → **400**
  `{"code": "app_update_required", "message": "Splitting a receipt by item is no longer supported. Update TrackSpense and try again."}`.
  Checked before the totals rule, so old apps always get this message, never a wrong split.
- Empty item list → 400 (ROADMAP P0).
- Stored `split_type` is the chosen type; `expenses.tax`/`tip` are stored; no `expense_item_splits` rows are written.
- `GroupExpenseRow` gains `has_items: bool` (K4). Old rows keep `split_type = "itemized"`.
- `GET /groups/{id}/items/suggest_assignment` and `SplitSuggestionService.suggest_assignment` are removed (404).
- `PUT /groups/{id}/expenses/{eid}` on an expense with items refuses percentage/adjustment splits.

### Item edits (`PUT .../items`, personal and group)
Body gains `tip` and optional `split`; lines may carry `id`. Totals rule applies.
- Amount unchanged → payers and shares are kept exactly; split type unchanged (fixes K1).
- Amount changed → payers rescale as today; equal/shares re-resolve from their stored basis; exact or legacy
  `itemized` → 400 `{"code": "split_required"}` unless `split` (equal/exact/shares) is sent. Clients then ask the
  user to pick Equal, Exact or Shares. The group expense PUT without a split follows the same rule for legacy receipts.
- Lines sent with an existing `id` are updated in place so their old assignment rows stay; new lines are inserted;
  lines left out are deleted (see decision D4).

### Per-person item analytics (K5)
New group receipts: each member's share of a line = `line_total × member_share / amount`, computed when needed, never
stored. Old receipts keep using their `expense_item_splits`, so delete backs out exactly what create added.

### MCP (external contract; connected assistants must move)
`ReceiptItem` gains optional `original_price`; `line_total` stays the paid price (K7). Header `discount` is divided
across lines by price at verify time, so the approval page shows the lines that will be saved. `accept_unreconciled:
true` is refused (`totals_mismatch`), because AC-004 covers every save path. Save re-checks totals, so an operation
verified before deploy that no longer matches is refused and the user verifies again. Tool descriptions updated.

### Clients (web and mobile in parity)
- Remove `ItemSplitBoard` (+ tests), `suggestItemAssignment`, mobile `ReceiptItemsSheet` assignment step,
  `receiptSplit.ts` ratio helpers, `assignments` state; web `AddExpenseForm` dead group-receipt branch (K8).
- Quick Capture (web `QuickCaptureSheet`/`useLogExpense`, mobile `AddExpenseScreen`): a group receipt offers Equal
  (default), Exact, Shares in the existing split editor; sends `split`, header `tax`/`tip`, line `discount`/
  `original_price`; no more tax/discount on the first item; personal path sends the scanned tip (K2).
- `ScannedItemsCard` (web, mobile): shows paid price per line, "saved X" when discounted, editable original price
  (also when the scanner could not read one), tip row, review list for refund lines, totals check with no discount term;
  Save stays disabled until totals match.
- Item view/edit (web `ExpenseDetailSheet`, `ExpenseDetailDialog`; mobile `ExpenseItemsViewSheet`,
  `EditGroupExpenseModal`): load items when `has_items` (or legacy `itemized`), show the old-format banner, send `tip`,
  handle `split_required` by asking for Equal/Exact/Shares; receipt split editor hides Percentage and Adjustment.
- Error handling: show the server's `app_update_required` and `split_required` messages as written.

## Risks and safeguards
- **Money (shares).** Shares come from the one tested split engine; totals checked on the server before any write;
  item edits with an unchanged amount cannot touch shares (test S-08). No negative line, share or price can be stored.
- **Double discount.** Prevented by the totals rule having no discount term, the header-discount refusal, and the
  `original_price IS NULL` marker for old rows (S-14..S-16).
- **Contract break (installed apps, MCP).** Old mobile builds get `app_update_required` when saving a *group receipt*
  or a receipt with a header discount; plain expenses and personal receipts without a header discount keep working.
  Between the backend release and the mobile release, group receipt saves from phones are blocked (decision D6).
- **Migration.** Adds one nullable column, no backfill, no lock-heavy work; old code ignores it, so rollback of the app
  is safe without a down-migration. Rehearsed on local Postgres (`make migration-rehearsal`). Runs only through the
  normal pipeline after release authorization; never run by me against a non-local database.
- **Authorization.** No new endpoints. Membership checks unchanged (non-members 404). All member ids in `split` are
  validated against the group as today. `user_id` still comes from the token.
- **AI/privacy.** Prompts change only in wording/flag; nothing new is sent to the provider; quota path unchanged.
- **Concurrency.** Personal item edits keep `lock_personal_user`; last write wins (existing rule).
- **Performance.** Normalizer is O(lines); receipts are capped (MCP 200 lines). No new queries in list views except
  `has_items` (an EXISTS per page, batched in one query).
- **Production data.** I will not query production. If you want counts of old-format receipts first, I'll show a
  read-only query for your separate approval.

## Ordered tasks
- [ ] T1: Migration adding `expense_items.original_price` (random hex id) + model field; rehearse on local Postgres. Backend. Engineer. Evidence: migration-postgres.
- [ ] T2: `services/receipt_lines.py` normalizer + shared totals helper (`reconcile_receipt_totals` without discount term); unit tests first. Backend. S-01..S-07, S-20.
- [ ] T3: Apply normalizer in `ReceiptService._finalize`; prompts get `is_refund`, no negative-result wording; parser output untouched except negative adjustment handling. Backend. S-05..S-07.
- [ ] T4: Personal create/item PUT: new line fields, `tip` on PUT, header-discount refusal, totals rule, `original_price` always written, `expenses.discount` = sum of savings; legacy conversion in GET items. Backend (`api/routes.py`, `postgres_repo.py`, `api_models.py`). S-09..S-11, S-14, S-15.
- [ ] T5: Group receipt create: new contract, `app_update_required`, split via `resolve_split`, tax/tip stored, empty list refused, delete `item_split_engine`, `has_items` on rows, refuse percentage/adjustment on PUT for receipts. Backend. S-01..S-04, S-12.
- [ ] T6: Group item PUT + legacy rules: keep shares on same amount, `split_required`, in-place line update by id; group expense PUT legacy amount rule. Backend. S-08, S-13, S-16.
- [ ] T7: Per-person item analytics from shares for new receipts; legacy keeps assignment rows. Remove `suggest_assignment` route/service. Backend. S-17, S-18.
- [ ] T8: MCP schemas/operations/tool text: `original_price`, header discount folded at verify, `accept_unreconciled` refused, save re-check. Backend (Tier-3 `mcp/`). S-19.
- [ ] T9: Web: API types, Quick Capture group split (Equal/Exact/Shares), tip, ScannedItemsCard, item view/edit, legacy banner, error messages; delete ItemSplitBoard, suggestItemAssignment, AddExpenseForm dead branch. Web. S-21..S-24.
- [ ] T10: Mobile: same as T9 in `AddExpenseScreen`, `ScannedItemsCard`, `ExpenseItemsViewSheet`, `EditGroupExpenseModal`, groups/expenses API; delete ItemSplitBoard, ReceiptItemsSheet assignment step, receiptSplit ratios; keep testIDs or update the Maestro flows. Mobile. S-21..S-24.
- [ ] T11: Playwright `receipt-scan.spec.ts` updated (group receipt Equal split, coupon line, totals refusal); Maestro receipt flow if it uses item assignment. QA. S-25, S-26.
- [ ] T12: Docs: spec (receipt split, line format, totals rule, MCP contract), FEATURE_STATUS, ROADMAP (close the coupon decision and the P0), CHANGELOG, MCP runbook. Engineer.

## Verification and documentation
required_evidence (work-item.json): `checks` (make check: backend, web, mobile, security, accessibility), `red-green`
(K1, K2, P0 reconciliation and coupon double-subtraction fail before the fix), `migration-postgres`,
`local-integration` (Playwright on the local stack), `native-e2e` + `native-device` (mobile changed; local, release
time), `code-review`, `security-review`, `ui-review`, `product-review`, `acceptance-verification` (each AC against
test-plan.md). Docs marked planned now, implemented in Build: spec, FEATURE_STATUS, ROADMAP.

## Rollout and recovery
Ship as one release: migration (pipeline job, before backend) → backend → web; mobile build released as soon as possible
after. No feature flag: a flag would mean keeping item assignment alive, which requirement 2 removes. Signals after
release: 400 `app_update_required` and `split_required` counts in Cloud Run logs, receipt save errors in GA4/Crashlytics.
Recovery: redeploy the previous backend/web images; the extra column is harmless to old code. Receipts saved in the
new format read correctly in old code except that old code would subtract `expenses.discount` on item edit — so on
rollback, old item edits of new receipts would fail the totals check (refused, not wrong). Acceptable; noted.

## Decisions for the owner (new in Plan)
- **D1** Store original price in a new nullable column `expense_items.original_price` (migration; also the old-format marker). Tip/tax for group receipts use existing `expenses` columns.
- **D2** Group receipts keep the `/expenses/itemized` URL with a new body; stored split type is equal/exact/shares plus a new `has_items` flag.
- **D3** Per-person item analytics for new group receipts follow each person's share of the total.
- **D4** Editing a line keeps its old assignment rows (in-place update). Deleting a line deletes that line's assignment rows (database cascade). Money is unaffected because shares live in `expense_splits`. Keeping them for deleted lines too would need soft-deleted lines; not planned.
- **D5** Refund lines are left out of the items and listed for review; the user fixes prices or the amount until totals match.
- **D6** Accept that installed phone builds cannot save group receipts between the backend release and the mobile release (they see the update message).
- **D7** MCP `accept_unreconciled: true` is refused, and header discounts are folded into lines at verify time.
- **D8** An amount change on an Exact or old item-split receipt requires choosing Equal, Exact or Shares (`split_required`); Equal and Shares receipts re-split automatically.
