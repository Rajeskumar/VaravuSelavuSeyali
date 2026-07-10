# TS-GRP-144: "Add Expense" button label consistency

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 5.

## Description
Group Detail has two "Add Expense" entry points with inconsistent capitalization ("Add Expense" vs.
"Add expense").

## Investigation
Read `GroupDetailPage.tsx`'s own two visible-text instances (its "+ Add Expense" button and the dialog's
submit button) — both already say **"Add Expense"**, correctly capitalized. Neither is the mismatch.

Broadened the search and found the actual source: `components/layout/MainLayout.tsx:53` — the global
"+" FAB (added in TS-DES-111, reachable from every authenticated route including Group Detail) has
`aria-label="Add expense"` (lowercase e). Since the QA pass was conducted via a real browser session
with accessibility-tree/network inspection (per the doc's own header), this is almost certainly what
surfaced as the "second Add Expense button" on Group Detail — the page's own button plus the global
FAB, sitting on the same screen with different accessible-name casing. The FAB's label isn't visible
text (no on-screen mismatch for sighted users), but it is a real, fixable inconsistency in the
accessible name a screen-reader user would encounter.

Checked mobile for the same pattern — no "Add Expense" capitalization inconsistency found anywhere
(mobile's global "+" doesn't have a text-based accessible label with this issue; it uses a purely
visual "+" glyph reached via `openAddExpense()`, no aria-label to mismatch).

## Fix
`MainLayout.tsx`: `aria-label="Add expense"` → `aria-label="Add Expense"`.

## Files touched
- `varavu_selavu_ui/src/components/layout/MainLayout.tsx`

## Acceptance criteria
- Every "Add Expense" label/accessible-name in the web app (visible text and aria-label alike) uses
  Title Case consistently.

## Implementation notes (post-build)

One-line fix. **Verified live**: the FAB's accessible name (via accessibility-tree query) now reads
exactly "Add Expense" — confirmed with the browser's own accessibility snapshot, the same inspection
method that most plausibly surfaced this in the original QA pass.
