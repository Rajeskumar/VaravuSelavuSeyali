# TS-GRP-147: Recurring expense sync between Dashboard and Expenses (targeted reproduction)

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 9.

## Description
A manually-triggered `execute_now` expense appeared correctly in both views immediately — the
originally reported mismatch (TS-GRP-139) didn't reproduce that way. The QA doc's own hypothesis: test
the path not yet tried — confirming a due recurring expense via the **login auto-prompt flow**
specifically — and check whether React Query's cache or the AnalysisService cache is serving stale data
to one view but not the other.

## Investigation — root cause found via code trace, matching the hypothesis exactly

TS-GRP-139 (the original ticket) diagnosed: Dashboard's recent feed bypasses React Query (raw `fetch` in
a `useEffect`, always fresh), while the Expenses page uses React Query with a 1-minute `staleTime` and
no invalidation signal when a recurring expense is created server-side.

TS-GRP-139's fix was implemented, but **only on the manual "Run Now" path**:
`RecurringPage.tsx`'s Run Now handler (`components/expenses/RecurringCard.tsx` action) calls
`executeRecurringNow()` then:
```ts
qc.invalidateQueries({ queryKey: ['expenses'] });
qc.invalidateQueries({ queryKey: ['all-group-expenses'] });
```

**The login auto-prompt confirm flow is a completely separate component that never got the same
treatment.** `components/expenses/RecurringPrompt.tsx` (the drawer that appears once per session on
login if templates are due, calling `getRecurringDue`/`confirmRecurring`) does this on confirm:
```ts
if (toSend.length > 0) await confirmRecurring(toSend);
setOpen(false);
```
No `invalidateQueries` call at all, and no use of the `notifyExpenseChanged()` event bus (added in
TS-DES-111) that `DashboardPage.tsx` already listens for either. So: confirming due recurring expenses
through the login prompt creates the expense correctly on the backend, but neither the Expenses page's
React Query cache nor a stale-mounted Dashboard gets any signal to refetch — exactly the "appears on
Dashboard, missing from Expenses" symptom TS-GRP-139 described, just reachable through a code path that
was never fixed.

This is a **confirmed, code-level root cause** — not a "couldn't reproduce" situation. The original
manual-trigger test in TS-GRP-139/the QA doc didn't reproduce it because it exercised the *other*,
already-fixed path.

## Fix
`RecurringPrompt.tsx`'s `onConfirm`, after the `confirmRecurring(toSend)` call succeeds:
- `queryClient.invalidateQueries({ queryKey: ['expenses'] })` and `['all-group-expenses']` — same as
  `RecurringPage.tsx`'s pattern, fixes the Expenses page.
- `notifyExpenseChanged()` (from `utils/expenseEvents`) — fixes a currently-mounted Dashboard, which
  already listens for this signal (`DashboardPage.tsx`'s `onExpenseChanged` effect from TS-DES-111) but
  has no other way to learn about expenses created outside its own fetch.

## Files touched
- `varavu_selavu_ui/src/components/expenses/RecurringPrompt.tsx`

## Acceptance criteria
- Confirm one or more due recurring expenses via the login prompt; without a manual refresh, both the
  Expenses list and (if mounted) the Dashboard reflect the new expense(s).
- No regression to the already-working manual "Run Now" path.

## Implementation notes (post-build)

**Verified live, exactly the reproduction path the QA doc asked for:** created a real recurring
template (`day_of_month` = today), visited the Expenses page first (priming its React Query cache with
the pre-existing state), then triggered the login-prompt drawer (it fires on first mount post-login
regardless of which page that happens to be, confirming it isn't Dashboard-specific), confirmed all
due occurrences, and — without any manual refresh — the Expenses list immediately showed every newly
created expense interleaved correctly by date with the pre-existing one. Before this fix, the Expenses
page would have stayed stale (cache untouched) for up to a minute. Dashboard was also confirmed showing
the new expenses in its Recent feed on next load.

`npx tsc --noEmit` clean; full web Jest suite (46 tests) passes unchanged.
