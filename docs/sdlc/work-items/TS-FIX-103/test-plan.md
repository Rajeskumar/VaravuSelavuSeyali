# Test specification

Requirements: requirements.md; acceptance-criterion text: work-item.json.

| Scenario ID | AC IDs | Preconditions / fixture | Action | Expected outcome | Level / location |
|---|---|---|---|---|---|
| S1 | AC-001 | Guest owes viewer | tap guest row | guest → viewer, transfer amount | Jest GroupDetailScreen.settle |
| S2 | AC-001 | Viewer owes member | tap member row | viewer → member | Jest GroupDetailScreen.settle |
| S3 | AC-001 | No transfer between them | tap row | no sheet, message | Jest GroupDetailScreen.settle |
| S4 | AC-001 | People tab params | open screen | same as S1 | Jest GroupDetailScreen.settle; flow settle-up (rows, stored data) |
| S5 | AC-002 | Equal expense, one payer | change amount, save | PUT without payers/split | Jest EditGroupExpenseModal.save; flow group-expense-edit-delete (stored shares) |
| S6 | AC-002 | One payer, split picker used | change amount, change split, save | payer amount = new total | Jest EditGroupExpenseModal.save |
| S7 | AC-003 | Personal expense, one group | move | group expense query invalidated | Jest ExpensesScreen.move; flow expense-move-group |
| S8 | AC-004 | iOS number pad open | tap Save once | saved, sheet closes | flow expense-edit-delete (no keyboard workaround) + screenshot |
| S9 | AC-005 | Web, equal expense | change amount, or only the description | Save enabled; PUT without payers/split | Jest ExpenseDetailDialog.save |
| S10 | AC-006 | Owed by one / by several / nobody | button or own row | pre-filled / Balances + message / message | Jest GroupDetailScreen.settle |
