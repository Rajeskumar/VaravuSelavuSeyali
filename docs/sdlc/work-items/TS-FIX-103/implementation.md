# Implementation plan

Status: built 2026-11-27. Requirements: requirements.md; AC text: work-item.json.

## Architecture and contracts
- AC-001: pure helper `features/groups/utils/settleUp.ts` nets the transfers between viewer and counterparty in cents.
  `GroupDetailScreen.handleSettleUp` uses it; another member's `net` no longer decides direction or amount (AGENTS rule).
  The People tab shortcut waits for refetched balances.
  No transfer between the two: an explanatory toast, no sheet. Own row: the viewer's outgoing transfers, else a toast.
- AC-002: `EditGroupExpenseModal` sends `payers` and `split` only when a picker was touched (as web does for receipts, and for all expenses from AC-005).
  The server has carried over and rescaled an omitted split since release-v1.2.0, so no backend change or deploy order.
  A single payer's amount follows the amount field (web's effect).
  While an amount change will be adjusted by the server, the editors hide their old previews and checks and say so.
- AC-005: `ExpenseDetailDialog` drops `!isItemized` from `splitTouched` and shows the same adjustment note.
- AC-006: one `openMySettleUp` serves the header button and the viewer's own row. Several incoming payments are never
  bulk-recorded: it opens Balances and asks who paid.
- AC-003: `ExpensesScreen.handleMove` calls `refreshExpenseViews`; the screen's own listener refetches personal rows.
- AC-004: edit sheet's KeyboardAvoidingView may shrink; Cancel/Save move to a fixed footer outside the ScrollView;
  the ScrollView uses `keyboardShouldPersistTaps="handled"`.

- AC-007: `features/groups/utils/parseAmount.ts` returns null unless the text is digits with at most one decimal mark
  (dot or comma) and two decimals. Settle up uses one parsed value for its label, payment links, summary and POST; group
  edit uses it for the PUT, payer follow-up and pickers. Web uses number inputs and is unchanged.
- Android keyboard: sheets use `KeyboardAvoidingView` padding (or `KeyboardLift`) and can shrink; Settle up scrolls with
  its action below the scroll area; split fields select a filled value once on focus.

- AC-008: `SettleUpSheet` locks on the first submit (a ref, so two taps before a re-render count once) and keeps the
  lock after success until the sheet is opened again; the button is disabled outside the review stage.
  An unknown outcome (`RequestError.outcomeUnknown`) keeps the lock, refetches, closes and shows an alert. Dismissal is
  off while sending. `openSettleSheet` refuses while balances are fetching or in error.
- AC-009 / AC-011: keystroke fields turn a comma into a dot before the existing two-decimal check; text that fails it is
  ignored. Receipt prices keep dropping minus signs and currency symbols.
- AC-010: `ExpensesScreen` edit uses `parseAmount` for both PUTs, the card picker and the receipt check.

## Risks and safeguards
Money: direction and amount come only from server transfers; the user still confirms. No schema, auth or API change.
Omitting the split must not reset a custom split: covered by server carry-over (existing backend tests) and the native flow's stored-data check.
Already-wrong stored settlements are not repaired by this change.

## Ordered tasks
- [ ] T1: settle-up direction (AC-001; S1-S4)
- [ ] T2: group amount edit (AC-002; S5-S6)
- [ ] T3: refresh after move (AC-003; S7)
- [ ] T4: iOS edit sheet (AC-004; S8)
- [ ] T5: web group edit (AC-005; S9)
- [ ] T6: Settle up button and own row (AC-006; S10)

## Verification and documentation
See test-plan.md and required_evidence. Docs: CHANGELOG, ROADMAP, spec if a documented rule changes.

## Rollout and recovery
Ships with the next mobile build; revert is a plain code revert. Installed older builds keep the bugs until updated.
