# TS-GRP-129 — Settle-by-expense (mark specific expenses settled)

**Phase:** 3 · **Spec:** §5.3, §2.3 (Splitwise pain point #3) · **Status:** 📋 Planned

## Scope

Splitwise pain point #3 this feature exists to fix: "Settle-up is all-or-nothing — users want to pay/mark individual expenses, not only the full balance." Today the only way to reduce a balance is `SettlementService.create_settlement` (`services/settlement_service.py:47-98`), which records a lump amount between two members with no link back to *which* expense(s) it covers.

## Design decision (not spec-prescribed — derive carefully)

The spec doesn't define a schema for this. The cleanest construction that reuses everything already built: settling a specific expense share **is** creating a `Settlement` for exactly that split's `amount_owed`, between that split's `member_id` and the expense's payer — the existing `net(m)` math (§7.1) already handles the balance reduction correctly the moment a `Settlement` row exists, with zero changes to `BalanceService._compute_nets`. What's missing is (a) a convenience endpoint that auto-fills the settlement amount/parties from a specific expense's split, and (b) a way to mark that a given split has been "settled by expense" so the UI can show a per-expense paid/unpaid badge and prevent double-settling the same share.

- **New column:** `expense_splits.settled_via_settlement_id` (nullable UUID FK → `settlements.id`, `ondelete=SET NULL` — if the settlement is later undone via the existing `DELETE /settlements/{id}` (`settlement_service.py:110-...`), the split should revert to unsettled, not dangle).
- **New endpoint:** `POST /groups/{group_id}/expenses/{expense_id}/settle_share` with body `{member_id}` (whose share is being settled) — looks up that member's `expense_splits` row for that expense, the expense's payer (for single-payer expenses; for multi-payer expenses per **TS-GRP-114**, this needs a `payer_member_id` in the request body since there's no longer one unambiguous payer to settle with), creates a `Settlement` for exactly `amount_owed`, and stamps `expense_splits.settled_via_settlement_id`.

## Files it will touch

- **New:** Alembic migration adding `expense_splits.settled_via_settlement_id`.
- `varavu_selavu_app/varavu_selavu_service/db/models.py` — add the column to `ExpenseSplit` (`models.py:196-208`).
- `varavu_selavu_app/varavu_selavu_service/services/settlement_service.py` — new `settle_expense_share(group_id, expense_id, member_id, payer_member_id, actor_email)` method, delegating to the existing `create_settlement` internals for the actual `Settlement` row, then updating the `expense_splits` row. `delete_settlement` (`settlement_service.py:110+`) must additionally null out any `expense_splits.settled_via_settlement_id` pointing at the deleted settlement (or rely on the FK's `ON DELETE SET NULL` if the DB enforces it — confirm SQLite test behavior matches, since SQLite's FK enforcement is off by default and the test suite may need `PRAGMA foreign_keys=ON` or an explicit application-level unset to behave the same on both dialects).
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `POST /{group_id}/expenses/{expense_id}/settle_share` route.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `SettleExpenseShareRequest`, and add `settled: bool` to `GroupExpenseRow`/`PayerSummaryItem`-adjacent DTO so the list view can render a paid badge without a second round-trip.
- **Web:** a "Mark as settled" action per-expense-row on `GroupDetailPage.tsx`'s expense list (in addition to the existing group-wide `SettleUpDialog`), plus a "Paid" chip on settled rows.
- **Mobile:** equivalent on `GroupDetailScreen.tsx`'s expense tab.

## Acceptance criteria

- Settling a single expense's share creates exactly one `Settlement` for the exact `amount_owed`, and that split is marked settled.
- The group's overall `net(m)` balance reflects the settlement immediately (no special-casing needed in `BalanceService` — verify this is actually true rather than assuming).
- Attempting to settle an already-settled share → `409` (don't create a duplicate settlement for the same share).
- Undoing the settlement (`DELETE /settlements/{id}`) reverts the split to unsettled.
- Multi-payer expenses require an explicit `payer_member_id` in the request and reject ambiguous calls with `400` if omitted while multiple payers exist.

## Dependencies

- **TS-GRP-105** (`SettlementService`), **TS-GRP-104** (`expense_splits`), **TS-GRP-114** (multi-payer — changes what "the payer" means for this feature).

## Test requirements

- Extend `varavu_selavu_app/tests/test_settlements_api.py`: settle-share happy path, double-settle `409`, undo-reverts-to-unsettled, multi-payer requires explicit payer, balance math matches a plain `create_settlement` for the equivalent amount (i.e. this is provably just sugar over the existing mechanism, not a parallel one).
