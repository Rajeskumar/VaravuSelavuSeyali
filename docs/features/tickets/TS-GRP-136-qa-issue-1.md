# TS-GRP-136: Auto-categorization not working for group expenses

## Description
During QA of the redesign and Groups feature, it was found that auto-categorization does not work when adding a group expense. 

## Finding / Root Cause
The `GroupDetailPage.tsx` component in the Web UI implements its own inline flow for creating group expenses, which directly renders a basic `TextField` for the `category` state rather than reusing the fully-featured `AddExpenseForm.tsx` logic. Consequently, this inline flow **never calls the `/expenses/categorize` API endpoint** (via `suggestCategory`) when a user types a description. 

Because it's never wired in, this is a missing integration rather than a broken one. The backend API handles the `category` field correctly if it is passed.

## Proposed Fix
Integrate the `suggestCategory` API logic from `api/expenses.ts` into `GroupDetailPage.tsx` so that it matches the behavior of personal expenses, OR refactor `GroupDetailPage` to use the shared `AddExpenseForm` component instead of maintaining an isolated form.
