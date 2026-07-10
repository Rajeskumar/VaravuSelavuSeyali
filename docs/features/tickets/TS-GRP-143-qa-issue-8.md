# TS-GRP-143: Complete the "My Expenses" rename

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 4.

## Description
"My Expense" (singular) still appears on the lens control in at least one place, despite the "My
Expenses" rename.

## Investigation
Searched both apps for the literal string "My Expense" not followed by an "s". Found exactly two spots,
both web, both lens-control option lists (the "My Share"/"I Paid"/"Group Total"-style segmented
control):
- `components/dashboard/TrueTotalHero.tsx:13` — `{ value: 'my_share', label: 'My Expense' }` (Dashboard's
  lens control — matches the ticket's specific mention).
- `components/analysis/AnalysisLensSwitch.tsx:13` — `{ label: 'My Expense', value: 'combined' }`
  (Analysis page's equivalent control — not named in the ticket, found via the broader search it asked
  for).

Checked mobile for an equivalent lens control — **none exists**. Mobile's `HomeScreen.tsx` has no
My Share/I Paid/Group Total switch at all, so there's no mobile instance of this specific bug.

Also found lowercase `my expense` used in mobile's `HomeScreen.tsx:322` (`` `${groupName} · my expense` ``)
and `ExpenseCard.tsx:93` (`` `my expense: ${...}` ``) — these are a different, unrelated usage: an inline
per-row descriptor phrase, not a proper-noun lens/tab label, and lowercase is grammatically correct
there. Left untouched — renaming these would be a different, unrelated copy change, not "finishing the
My Expenses rename."

## Fix
- `TrueTotalHero.tsx`: `'My Expense'` → `'My Expenses'`
- `AnalysisLensSwitch.tsx`: `'My Expense'` → `'My Expenses'`

## Files touched
- `varavu_selavu_ui/src/components/dashboard/TrueTotalHero.tsx`
- `varavu_selavu_ui/src/components/analysis/AnalysisLensSwitch.tsx`

## Acceptance criteria
- No remaining "My Expense" (singular) label anywhere in either app's source.
- Dashboard and Analysis lens controls both read "My Expenses".

## Implementation notes (post-build)

Both spots were a one-line literal-string change, no logic involved. Follow-up repo-wide grep for
"My Expense" not followed by "s" came back empty across both apps after the fix. `npx tsc --noEmit`
clean. Not separately screenshotted live — the test account used for this batch's live verification
has no groups, so the lens control (which only renders when `groupsEnabled && groupSummaries.length >
0`) doesn't show; confirmed correct via source read instead, which is sufficient confidence for a
literal string swap with no surrounding logic to verify.
