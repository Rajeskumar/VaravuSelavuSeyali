# Implementation plan

- AC-001: validate with `core.money.MoneyAmount`. `confirm_recurring` items become a typed model (422); run-now keeps its
  `{success: false}` answer. NaN currently passes `cost <= 0`.
- AC-002: `qa/scripts/qa_db_guard.py` (anchored URL pattern, drops PGHOSTADDR/PGSERVICE) used by the account and verification
  scripts; the reset-token script keeps its own stricter guard (`trackspense_qa` only).
  The mobile suite provisions into `trackspense_e2e_*`, so that name is allowed.
- AC-003: migration adds nullable `settlements.client_request_id` and a unique index on (group_id, created_by,
  client_request_id); NULLs never collide. The service returns the stored row on a repeat and catches the unique
  violation for concurrent sends. The route notifies only for a new row. Overpayment stays allowed.
- AC-004: the id is managed inside `recordSettlement` / `createSettlement`, so every caller gets it. Kept in memory;
  once unconfirmed, only success, a 409 or an hour releases it. A replay answers `already_recorded`, and the apps say
  nothing new was added (after review: a real second identical payment would otherwise pass as recorded).
- AC-005: `lock_expense` (`SELECT ... FOR UPDATE` on the expense row, re-read once granted; a no-op on SQLite). The first
  version locked the share row; review showed edits replace those rows, so a second request waiting on them saw none.
- AC-006: both paths that replace shares (`update_expense`, and `update_items` for receipt lines) read the paid marks and
  carry them over by member. Both, `settle_expense_share` and `delete_settlement` take `lock_expense` before reading
  shares; `update_expense` takes it after the exchange-rate lookup, which can commit. The mark is kept even when the amount
  changes: the button never records a whole share twice, and Settle up covers the difference. A member removed from the
  split and added back starts unpaid. Moving an expense between groups is unchanged.
- AC-007: both expense detail views call `onSettled` after a 409.

## Risks and safeguards
Money and schema change. Additive, nullable column; old code ignores it, so rollback needs no downgrade. Deploy order:
migrate, then backend (the release pipeline already does this), then clients; old server ignores the new field and old
clients behave as before. Migration rehearsed only on a disposable local PostgreSQL.

## Rollout and recovery
Plain code revert; the column can stay.
