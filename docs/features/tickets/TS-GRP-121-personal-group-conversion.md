# TS-GRP-121 — Convert personal expense ↔ group expense

**Phase:** 2 · **Spec:** §5.2, §8.2, §14 (E11) · **Status:** 📋 Planned

## Scope

`POST /expenses/{expense_id}/move_to_group` (§8.2) — converts an existing personal expense (`group_id IS NULL`) into a group expense in place: same `Expense` row gains `group_id` + `split_type`, plus new `expense_payers`/`expense_splits` rows. E11: "the converter becomes sole payer by default. Audit entry logged." The reverse direction (group → personal) is not in the spec's endpoint table but is implied by user story context ("and back" isn't explicitly named for this feature, unlike leaving a group) — **scope this ticket to personal→group only**, matching §8.2 exactly; if reverse conversion is wanted later it's a separate, smaller follow-up (removing `group_id`/splits/payers and reverting `split_type` to `NULL`), not automatically part of this ticket.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/expense_service.py` — the personal expense currently being converted must be locatable/mutable; note `get_expenses_for_user`/`update_expense`/`delete_expense` all filter `Expense.group_id.is_(None)` (`expense_service.py:69,96,138`, added by **TS-GRP-108**'s bugfix) — this is exactly the set of rows eligible for conversion, so reuse that same lookup guard when finding the source expense.
- **New:** a `convert_to_group` method — could live on `GroupExpenseService` (it's creating group-side rows) or `ExpenseService` (it owns the source row); recommend `GroupExpenseService.convert_personal_expense(expense_id, group_id, actor_email, split_type, split_entries)` since it can reuse `_validate_and_resolve`/`SplitEngine` directly. Steps: (1) load the personal expense, verify `actor_email == expense.user_email` (only the owner can convert — the spec doesn't say group membership alone suffices, and converting someone else's personal expense would be a privacy violation), (2) verify `actor_email` is a member of the target group (`require_membership`), (3) set `expense.group_id`/`expense.split_type`, (4) insert one `expense_payers` row with the converter as sole payer, `amount_paid = expense.amount` (E11), (5) resolve and insert `expense_splits` via `SplitEngine`, (6) log a `group_activity` row (`expense_added` or a dedicated `expense_converted` action — recommend the latter, since "added" implies it didn't exist in the group's history before, and audit clarity matters here per E11's explicit call for a logged entry) if **TS-GRP-119** has landed, otherwise leave a `# TODO(TS-GRP-119)` marker.
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` or `api/routes.py` — new `POST /expenses/{expense_id}/move_to_group` route (§8.2 lists it under the *group* API surface despite the `/expenses/` prefix — place it wherever `auth_required` + group-membership DI is cleanest; likely `groups_routes.py` since it depends on `GroupExpenseService`). Request body: `{group_id, split: GroupSplitConfig}` per §8.2.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — new `MoveToGroupRequest` (`group_id: str`, `split: GroupSplitConfig`).
- **Web:** an entry point on `ExpensesPage.tsx`'s personal expense row menu (it already has `onEdit`/`onDelete` handlers per `ExpensesPage.tsx:316-317`) — add a "Move to group…" action opening a small dialog: pick group, pick split type/entries (reuse `SplitEditor`), confirm.
- **Mobile:** equivalent action on whatever personal-expense row menu/swipe-action exists (locate it under `varavu_selavu_mobile/src/screens` before starting).

## Acceptance criteria

- Converting a personal expense: `expenses.group_id`/`split_type` update in place (same `expense.id`, not a new row — item-level insight history keyed by `expense_id` in `item_price_history` stays intact if the expense had items); `expense_payers` gets exactly one row (converter, full amount); `expense_splits` resolve per the chosen split.
- Non-owner attempting to convert someone else's personal expense → `403`.
- Converting into a group the actor isn't a member of → `403`.
- Converting an expense that's already a group expense (`group_id IS NOT NULL`) → `400` (nothing to convert).
- `AnalysisService.invalidate_cache()` called (the expense now counts toward "my share" via the split leg instead of the full personal leg — both legs already correctly guard on `group_id IS NULL`/`IS NOT NULL` per **TS-GRP-106**, so this should "just work" once `group_id` flips, but verify with a before/after analytics assertion).
- Manual verification: convert a real personal expense with receipt items attached, confirm item insights (`item_price_history`) aren't orphaned or duplicated.

## Dependencies

- **TS-GRP-104** (`GroupExpenseService`, `SplitEngine` integration), **TS-GRP-106** (the `group_id IS NULL` analytics guard this relies on), **TS-GRP-108** (the `expense_service.py` guards this reuses).

## Test requirements

- New `varavu_selavu_app/tests/test_expense_group_conversion.py`: success case (assert `expense_payers`/`expense_splits` rows + `group_id` set), non-owner `403`, non-member-of-target-group `403`, already-a-group-expense `400`, analytics before/after (personal total drops by the expense amount, combined total unchanged since the converter is now credited via their split share equal to the full amount when they're sole participant, or reduced if they split it with others).
