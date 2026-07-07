# TS-GRP-115 — Itemized receipt group expenses (backend)

**Phase:** 2 · **Spec:** §3.4 (`itemized` ⭐), §6.1 (`expense_item_splits`), §7.3, §8.2, §10.1 · **Status:** 📋 Planned

## Scope

The differentiator feature: receipt line items assigned to members in any ratio, with tax/tip/discount pro-rated. This is new schema (`expense_item_splits` doesn't exist yet — confirmed absent from `db/models.py`) + a new endpoint `POST /groups/{group_id}/expenses/with_items`, modeled closely on the existing personal `/expenses/with_items` route (`api/routes.py:528-580`) but resolving per-member item splits instead of just persisting items.

### Resolution algorithm (§7.3, made concrete)

1. For each item, resolve member ratios into a raw per-member item amount: `raw = item.line_total * ratio` (ratios for one item must sum to 1.0 — reuse a percentage-style reconciliation check).
2. Pro-rate `tax`, `tip`, `discount` (all currently exist on `Expense`: `models.py:36-38`) across members **proportional to each member's pre-tax subtotal** (sum of their raw item amounts) — i.e. `member_tax_share = tax * (member_subtotal / Σ all_members_subtotal)`, same for tip/discount (discount subtracts).
3. Sum each member's (item shares + tax share + tip share − discount share) → their raw expense-level `amount_owed`.
4. Run the existing single rounding pass from `SplitEngine` (`services/split_engine.py:138-175`) **once, at the expense level**, on these raw per-member totals — do not round per-item. This matches the spec's explicit instruction in §7.3 ("the rounding pass runs once at the expense level").

## Files it will touch

- **New:** Alembic migration adding `expense_item_splits` table per §6.1 DDL, translated to portable ORM types (UUID Python-side default, no `JSONB`) — mirror the conventions already established by `TS-GRP-101`'s migration. Columns: `id`, `expense_item_id` (FK → `expense_items.id`, `ondelete=CASCADE`), `member_id` (FK → `group_members.id`), `ratio` (`Numeric(7,4)`, `CHECK (ratio > 0 AND ratio <= 1)`), `amount` (`Numeric(12,2)`), `UniqueConstraint(expense_item_id, member_id)`.
- `varavu_selavu_app/varavu_selavu_service/db/models.py` — new `ExpenseItemSplit` ORM class next to `ExpensePayer`/`ExpenseSplit`.
- **New:** `services/item_split_engine.py` (or extend `split_engine.py` with an `resolve_itemized_split(items, tax, tip, discount, amount) -> List[SplitResult]` function) implementing the algorithm above. Keep it pure/DB-free like `SplitEngine`, per the same design rationale (§16 build-order note: pure functions are the risk center, test them in isolation).
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — new `GroupExpenseItemEntry` (mirrors personal `ExpenseItem` at `api_models.py:29-39` but adds `member_ratios: Dict[str, float]` per item — member_id → ratio), new `GroupExpenseWithItemsRequest` (header fields matching `GroupExpenseRequest` at `api_models.py:405-412` minus `payers`/`split` which are replaced by `payers: List[GroupExpensePayerEntry]` — multi-payer per **TS-GRP-114** — and `items: List[GroupExpenseItemEntry]`), `GroupExpenseWithItemsResponse` (mirrors `ExpenseWithItemsResponse` at `api_models.py:50-53`, adding per-member share breakdown).
- `varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py` — new `create_itemized_expense(...)` method: validates payers (reuse `validate_payers`), validates item ratios sum to 1.0 per item with per-field `400`s (§8.6), calls the new item-split resolver, persists `Expense` (with `split_type="itemized"`) + `expense_items` rows (reuse the same item-row shape as `PostgresRepo.append_items`) + `expense_item_splits` rows + the expense-level `expense_splits` rows (the resolved per-member totals — **both** tables are written: `expense_item_splits` for provenance/drill-down, `expense_splits` because that's what `BalanceService` and `AnalysisService`'s "my share" leg (§9.1) actually read).
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `POST /{group_id}/expenses/with_items` route. Reuse the **group-scoped fingerprint dedup** pattern from `api/routes.py:557-559` (`repo.find_expense_by_fingerprint`) but scoped to `group_id` (E7: "second attempt gets `409` with 'Arun already added this receipt'" — the error message must name the member who already added it, requiring a join from the existing expense's `user_email`/`group_members` back to `display_name`). Wire `analysis_service.invalidate_cache()` and `notification_service.fan_out(event_type="expense_added", ...)` exactly like the existing three group-expense routes (`groups_routes.py:299-316`).
- `varavu_selavu_app/varavu_selavu_service/services/insights_aggregation_service.py` — **do not** call `on_expense_with_items_created` (`insights_aggregation_service.py:39`) unmodified for group itemized expenses; see **TS-GRP-123**, which handles feeding item/merchant insights from *shares* rather than full amounts. This ticket should leave a clear seam (e.g. accept an optional `member_shares: Dict[item_id, Dict[member_id, amount]]` param) for TS-GRP-123 to fill in, but the aggregation-pipeline behavior change itself is out of scope here.

## Acceptance criteria

- `POST /groups/{group_id}/expenses/with_items` with items assigned in uneven ratios (e.g. steak 100% Alice, salad 100% Bob, wine 50/50) persists correct `expense_item_splits` and expense-level `expense_splits` that reconcile to the cent (`Σ amount_owed == amount`, invariant §3.3).
- Tax/tip/discount pro-rate proportionally to each member's item subtotal — verify against a hand-computed 2-person, tax+tip example.
- An item ratio set that doesn't sum to 1.0 → `400` naming the offending item.
- Duplicate receipt fingerprint within the same group by a different member → `409` with the original adder's `display_name` (E7).
- `force=true` bypasses the duplicate check (mirrors personal `/expenses/with_items`, `api/routes.py:540,558`).
- Item price history (`item_price_history.unit_price`) continues to record the **true** unit price regardless of split (§9.2) — do not scale `unit_price` by ratio.

## Dependencies

- **TS-GRP-101** (schema — this ticket adds one more table to the same migration family), **TS-GRP-104** (`GroupExpenseService`, `BalanceService` consuming `expense_splits`), **TS-GRP-114** (multi-payer, since itemized expenses commonly have multiple payers — build after or alongside).

## Test requirements

- New `varavu_selavu_app/tests/test_item_split_engine.py` (pure function tests: even split, uneven ratios, tax/tip/discount proration, rounding-residual distribution, ratio-doesn't-sum-to-1 rejection).
- Extend `varavu_selavu_app/tests/test_group_expenses_api.py` (or new `test_group_expenses_with_items_api.py`) with the fingerprint-dedup-names-the-adder case (E7) and the end-to-end reconciliation check.
