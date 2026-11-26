# Test specification

| Scenario ID | AC IDs | Preconditions / fixture | Action | Expected outcome | Level / location |
|---|---|---|---|---|---|
| S1 | AC-001 | three members; 10, 20, 90, 100 | choose Exact or Percentage | values add up exactly; extra cents on different people | web Jest `SplitEditor.test.tsx` |
| S2 | AC-001 | Math.random stubbed low and high | choose Exact on 10 | a different person gets the extra cent | same |
| S3 | AC-002 | totals a cent out, and float-noise totals | validate splits and payers | refused / accepted | web Jest; mobile `splitTolerance.test.ts` |
| S5 | AC-004 | negative values, legacy saved settings | server calls, API, typing a minus | refused or ignored; nothing stored; old settings load | pytest `test_no_negative_split_values.py`; web and mobile `noMinus.test.ts`; Playwright `group-expense-no-minus` |
| S4 | AC-003 | isolated stack | save pre-filled values: new, edit, move | stored shares add up to the cent | Playwright groups specs |
