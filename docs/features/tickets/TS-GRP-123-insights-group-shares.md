# TS-GRP-123 — Item/Merchant Insights fed by group shares

**Phase:** 2 · **Spec:** §5.4, §9.2 · **Status:** 📋 Planned

## Scope

Today `InsightsAggregationService` (`services/insights_aggregation_service.py`) is only ever invoked from the **personal** expense-mutation endpoints (`on_expense_with_items_created` called from `POST /expenses/with_items` at `api/routes.py:568-575`; `on_simple_expense_created`/`on_simple_expense_updated`/`on_expense_deleted` called from the personal `/expenses` CRUD routes). Group expenses created via `GroupExpenseService`/`POST /groups/{id}/expenses[/with_items]` never call into this pipeline at all — so a group member's `item_insights`/`merchant_insights` rows never reflect their group spend. Per §9.2, they must, and specifically using **share amounts**, not full expense/line amounts.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/insights_aggregation_service.py`:
  - `on_simple_expense_created`/`on_simple_expense_updated`/`on_expense_deleted` (`insights_aggregation_service.py:69-158`) all currently take a single `amount`/`user_email` pair. For group expenses, this must run **once per participating member**, each with that member's `amount_owed` (from `expense_splits`) instead of the full `expense.amount`, crediting `merchant_insights` under **that member's** `user_email` (registered members only — a placeholder member has no `user_email` to attribute insights to; skip placeholders, they have no personal insights surface to feed).
  - `on_expense_with_items_created` (`insights_aggregation_service.py:39-68`) similarly must run per-member using `expense_item_splits.amount` (the member's portion of each item, from **TS-GRP-115**) instead of `line_total`, feeding `_update_item_insight` (`insights_aggregation_service.py:159-221`) per member. §9.2 is explicit: *"Price history still records the true `unit_price` (a $4.99 milk is $4.99 regardless of split)"* — do **not** scale `item_price_history.unit_price` by the member's ratio; only the aggregate spend/quantity fields should reflect the share.
  - Recommend a new pair of entry points — `on_group_expense_created(group_id, expense_id, member_shares: Dict[member_email, amount], ...)` and `on_group_expense_with_items_created(..., member_item_shares: Dict[member_email, Dict[item_id, amount]])` — that internally loop and delegate to the existing per-member private helpers (`_update_item_insight`/`_update_merchant_insight`), rather than overloading the existing personal entry points with a "is this a group expense" branch. Keeps the personal code path untouched and this ticket additive.
  - `on_expense_deleted`/edit-reversal logic must also become member-aware for group expenses — reversing *each* participant's prior contribution, not just the creator's.
- `varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py` — `create_expense`/`update_expense`/`delete_expense` (`group_expense_service.py:105-246`) currently don't call the aggregation service at all; wire in calls to the new group entry points, following the exact `background_tasks.add_task(...)` pattern already used for `NotificationService.fan_out` in `api/groups_routes.py:309-316,380-388,416-422` (the aggregation service is presumably called synchronously today for personal expenses — check whether `api/routes.py`'s personal endpoints call it sync or via `background_tasks` before deciding; TS-ANL-006's spec title, "Expense Save-Time Aggregation Pipeline," and FEATURE_STATUS's note "Full async pipeline (`background_tasks`)" suggest **async** — match that).
- **TS-GRP-115**'s itemized-backend ticket left an explicit seam for this (`member_shares` param placeholder) — implement against that seam rather than re-deriving it.

## Acceptance criteria

- Adding a group expense updates `item_insights`/`merchant_insights`/`item_price_history`/`merchant_aggregates` for **every registered participating member**, each keyed to their own `user_email`, using their **share** amount (not the full expense amount, not the payer's amount).
- Placeholder-member shares are silently skipped (no insights row created for a `user_email = NULL` member).
- `item_price_history.unit_price` remains the true unit price regardless of any member's ratio.
- Editing a group expense's splits correctly reverses each affected member's prior contribution and applies the new one (mirror whatever reversal approach `on_simple_expense_updated`/`on_expense_deleted` already use for personal edits — read that logic carefully before reimplementing for the group case, since a naive re-application without reversal will double-count).
- Deleting a group expense reverses all participants' contributions.
- A member's **personal** Item/Merchant Insights pages (already-shipped UI, TS-ANL-002/003) show group-share-derived entries indistinguishably alongside personal ones — no group-specific UI change needed here, this is a pure data-pipeline ticket.

## Dependencies

- **TS-GRP-104** (group expense create/edit/delete), **TS-GRP-115** (itemized group expenses + the `expense_item_splits` data this reads), TS-ANL-006 (existing personal aggregation pipeline being extended).

## Test requirements

- Extend `varavu_selavu_app/tests/test_insight_analytics_service.py` and/or `tests/test_merchant_insights.py` with: a 3-member equal-split group expense updates all 3 members' `merchant_insights.total_spent` by their share (not the full amount); an itemized group expense updates each member's `item_insights` by their item-share amount while `item_price_history.unit_price` stays at the true price; edit-then-reassign-splits correctly reverses/reapplies; delete correctly reverses; a placeholder-member's share doesn't create an orphan insights row.
- Add a validation check to `scripts/backfill_insights.py` (per its existing "clears + replays + validates against source-of-truth sums" design, TS-ANL-012) confirming group-share contributions are included in the backfill and reconcile.
