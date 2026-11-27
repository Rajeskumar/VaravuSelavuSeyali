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
| S11 | AC-007 | Settle up and group edit open | type `12,50`; type `1,234.50`, `1,234`, `12.345` | 12.50 shown and sent; the others send nothing | Jest parseAmount, SettleUpSheet.amount, EditGroupExpenseModal.save |
| S12 | AC-008 | Settle up open | tap Record again while saving, during the animation, and in list mode while closing; retry after a failure | one POST per payment | Jest SettleUpSheet.amount |
| S13 | AC-009 | Split and payer pickers | type 2,50 | value 2.5 | Jest CommaInputs |
| S14 | AC-010 | Personal edit sheet | 12,50; 1,234.50 | 12.5 sent; nothing sent | Jest ExpensesScreen.editAmount |
| S15 | AC-011 | Receipt card | price 15,00; 1,234.50 | 15; ignored | Jest ReceiptLines |
| S16 | AC-008 | Settle up | time out single and list; dismiss while sending; open while balances refresh or after the refresh failed | one POST, alert, closed; not dismissed; nothing opens | Jest SettleUpSheet.amount, GroupDetailScreen.settle |
| S17 | AC-009, AC-011 | Split, payer, receipt fields | type 1,234.50, 1,000, 1.234,50 key by key; save from each screen | text visible, flagged, nothing saved | Jest UnreadableInputs, ReceiptLines, EditGroupExpenseModal.save, GroupSettingsSheet.split, ExpensesScreen.recurringAmount |
| S18 | AC-012 | Recurring template, inline edit, run now, due prompt | type 12.50, 12,50, 1,234.50, 0 | correct amount, or nothing saved with a message | Jest RecurringExpensesScreen.amount, ExpensesScreen.recurringAmount, RecurringPrompt |
| S19 | AC-013 | Equal split without values | switch type; POST with a blank value | filled 0 or 1; 400 with reason, nothing stored | Jest UnreadableInputs; tests/test_blank_split_values.py |
