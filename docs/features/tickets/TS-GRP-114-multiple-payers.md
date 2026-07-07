# TS-GRP-114 — Multiple payers on a single group expense

**Phase:** 2 · **Spec:** §3.1, §5.2, §8.5 · **Status:** 📋 Planned

## Scope

Allow two or more members to front portions of one bill. The schema already supports this — `expense_payers` has a `UniqueConstraint("expense_id", "member_id")` (many rows per expense), not a 1:1 constraint (`db/models.py:184-194`) — and `GroupExpensePayerEntry`/`GroupExpenseRequest.payers` is already a `List[...]` (`models/api_models.py:400-412`). The *only* thing enforcing single-payer today is one explicit guard in the service layer:

```python
# services/group_expense_service.py:56-58
def _validate_and_resolve(self, group_id, amount, payers, split_type, split_entries):
    if len(payers) != 1:
        raise HTTPException(status_code=400, detail=_SINGLE_PAYER_MESSAGE)
```

Remove that guard (and the now-unused `_SINGLE_PAYER_MESSAGE` constant at `group_expense_service.py:12`) and rely on the existing `validate_payers` (`services/split_engine.py:18-38`), which already sums `amount_paid` across **all** payers and checks it equals the expense total — that function was written payer-count-agnostic from the start.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py` — delete the `len(payers) != 1` guard and `_SINGLE_PAYER_MESSAGE`; add a duplicate-payer check (`len(payer_ids) != len(set(payer_ids))`) analogous to the existing duplicate-split-entry check at `group_expense_service.py:61-63`, since the DB unique constraint would otherwise surface as an ugly `IntegrityError` instead of a clean `400`.
- `varavu_selavu_app/varavu_selavu_service/services/balance_service.py` — `_compute_nets` (`balance_service.py:34-66`) already sums `Σ expense_payers.amount_paid` per member with no assumption of exactly one payer row per expense; `_pairwise_transfers` (`balance_service.py:67-107`) is the one that needs real attention: today it assumes a single payer per expense when building the "who owes whom" pairwise ledger (per the ticket note in `TS-GRP-104-group-expenses-balances.md`: *"each split-participant's amount owed becomes a pairwise debt to that expense's single payer"*). With N payers, that construction must be generalized — e.g. allocate each split-participant's `amount_owed` across the N payers proportionally to their `amount_paid` share of the expense total, then accrue those fractional pairwise debts. Get this right or `Σ net(m) == 0` will still hold (it's payer-agnostic) but the **transfer suggestions** will misattribute who-pays-whom.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — no shape change (`payers: List[GroupExpensePayerEntry]` already supports N); update the field's implicit "single payer" assumption in any docstrings if present.
- **Web:** `varavu_selavu_ui/src/components/expenses/AddExpenseForm.tsx` and `varavu_selavu_ui/src/pages/GroupDetailPage.tsx` — both currently render a single `TextField select label="Paid by"` (`GroupDetailPage.tsx:368`) yielding exactly one `payerId`. Needs a payer picker that supports multiple members each with their own `amount_paid`, with a live "paid total must equal amount" validation banner (mirror `SplitEditor`'s reconciliation-preview pattern at `SplitEditor.tsx:194-205`). This is UI work — bundle it into **TS-GRP-116** (web split-editor parity ticket) rather than duplicating scope here; this ticket is backend-only.
- **Mobile:** same split of concern — UI work lands in **TS-GRP-117**.

## Acceptance criteria

- `POST /groups/{group_id}/expenses` with 2+ `payers` entries whose `amount_paid` sums to `amount` succeeds; persists one `expense_payers` row per payer.
- `Σ amount_paid != amount` across N payers → `400` (already covered by `validate_payers`, just needs a multi-payer test case).
- Duplicate `member_id` across payer entries → `400` (new check).
- `GET /groups/{group_id}/balances`: `Σ net(m) == 0` still holds with multi-payer expenses (payer-count-agnostic by construction in `_compute_nets`).
- `GET /groups/{group_id}/balances` transfers correctly split a multi-participant debt across multiple payers proportional to what each payer fronted — assert against a hand-computed 3-payer scenario, not just the zero-sum invariant (the invariant alone won't catch a misattribution bug).
- `GroupExpenseRow.payer_summary` (already a `List[PayerSummaryItem]`, `api_models.py:415-428`) returns all payers, unchanged shape.

## Dependencies

- **TS-GRP-104** (`GroupExpenseService`, `BalanceService`).

## Test requirements

- Extend `varavu_selavu_app/tests/test_group_expenses_api.py`: 2-payer and 3-payer create/edit cases, mismatched-total rejection, duplicate-payer rejection.
- Extend `varavu_selavu_app/tests/test_balances.py`: a scripted scenario with 2 payers fronting one expense split among 3 participants — assert the exact pairwise transfer amounts, not just `Σ net == 0`.
