# TS-GRP-108 — Web: dashboard/expenses scope integration + receipt group toggle

**Phase:** 1 · **Build order:** 8th · **Spec:** §11.2, §8.4, §10.1, §17.1

**Status:** ✅ Implemented, pending review (see Implementation notes below)

## Scope

Wire the scope-aware analytics into the existing web surfaces and add the receipt-scan "this is a group expense" toggle (equal split for Phase 1). Per the resolved decision §17.1, the **dashboard layout is unchanged** — its numbers silently become *combined*.

## Files it will touch

- `varavu_selavu_ui/src/pages/DashboardPage.tsx`:
  - Numbers become **combined** (personal + user's group shares) by calling `/analysis?scope=combined` (via `src/api/analysis.ts`). Layout/cards unchanged.
  - Add a compact **"My Groups" widget** (group name, my-balance chip, tap → `/groups/:id`) and make the recent-transactions list a **unified feed** (group entries carry a badge, show *my share* primary / full amount secondary).
  - One-time explainer toast on first post-launch load ("Your totals now include your share of group expenses").
- `varavu_selavu_ui/src/api/analysis.ts` — add `scope` + `group_id` params to the analysis call (backend from TS-GRP-106). Keep the default call sending `scope=combined` for updated clients (old behavior preserved server-side when omitted).
- `varavu_selavu_ui/src/pages/ExpensesPage.tsx` — add a group **badge column** + a **Personal / Groups / Combined** scope filter (the filter lives here and on Analysis, not the dashboard); group rows show my-share prominently.
- `varavu_selavu_ui/src/pages/ExpenseAnalysisPage.tsx` — wire the scope filter to `GET /analysis?scope=`.
- Receipt/add-expense flow: the existing Add Expense form + receipt parse (`/ingest/receipt/parse`) gains a **Personal / Group** toggle → group picker → payer → equal split, then submits to `POST /groups/{id}/expenses` (TS-GRP-104). Locate the current add-expense component under `src/components/expenses/` / the expenses page and extend it; reuse `SplitEditor` (equal mode) from TS-GRP-107.
- Group-scoped receipt dedup: surface the `409` "already added this receipt" message (§10.1) when the backend reports it.

## Acceptance criteria

- Dashboard totals equal `personal + Σ my group shares` and the layout is visually unchanged vs. today; explainer toast shows once.
- "My Groups" widget lists groups with balance chips and deep-links to `/groups/:id`.
- Recent transactions is a unified feed; group entries badged with my-share primary.
- ExpensesPage scope filter switches the list among Personal / Groups / Combined and shows the group badge column.
- ExpenseAnalysisPage charts change with the scope filter (calls `?scope=`).
- Receipt scan → Group toggle → equal-split group expense is created and appears in the group and in combined analytics.
- Everything gated behind `GROUPS_ENABLED` (filters/widgets/toggle hidden when off), and with the flag off the dashboard still renders combined numbers safely (no group data → identical to personal).

## Dependencies

- **TS-GRP-106** (scope API), **TS-GRP-107** (groups pages, `SplitEditor`, `api/groups.ts`).

## Test requirements

- Extend existing page tests (`ExpensesPage.test.tsx` pattern): scope filter changes the queried endpoint; group badge rendering; dashboard combined-number rendering with mocked combined payload.
- Mock `api/analysis.ts` / `api/groups.ts`.
- Regression: with no groups, dashboard/expenses render identically to pre-feature (combined == personal).
- Manual smoke: scan receipt → mark group → equal split → confirm it lands in group + combined dashboard.

## Implementation notes (post-build)

- **Client-side unified feed, not a backend change.** There is no unified "all my group expenses" or group-tagged analysis-detail endpoint, so `listAllMyGroupExpenses()` (`src/api/groups.ts`) composes `listGroups()` + per-group `listGroupExpenses()` client-side. Acceptable per spec §6.5 (Phase 1 group volumes are small), but it means Groups/Combined scope on ExpensesPage does an unpaginated per-group fetch rather than reusing the existing infinite-scroll query.
- **ExpenseAnalysisPage's scope defaults to `personal`, not `combined`** — a deliberate asymmetry vs. Dashboard's forced-combined default (§17.1 only mandates the dashboard's numbers silently become combined; Analysis is filter-driven UI where changing existing users' default view without an explicit action seemed riskier). Flagging this as a judgment call in case product wants Analysis to default to combined too.
- **No group-scoped receipt dedup surfaced.** The ticket asks to surface a `409` "already added this receipt" from the backend, but `POST /groups/{id}/expenses` (built in TS-GRP-104) has no fingerprint/dedup check at all — only the personal itemized-receipt path does. Did not fake a client-side check for a response the backend can never return; this is a backend gap for a future ticket, not a frontend bug.
- **`SplitEditor` extended with `allowedTypes` prop** (default all three types) so the receipt/quick-add flow can force equal-only while `GroupDetailPage`'s full three-tab usage (TS-GRP-107) is untouched. All 5 pre-existing `SplitEditor` tests still pass.
- **Regression fix in `AddExpenseForm.test.tsx`:** adding `useGroupsEnabled()` (a `useQuery` call) to `AddExpenseForm` broke its existing test, since `useQuery` requires a `QueryClientProvider` ancestor even when `enabled: false`. Fixed by wrapping the test's render in a `QueryClientProvider`.
- **⚠️ Backend bug found during manual smoke test — not fixed here (out of this ticket's frontend-only scope), flagging as high-priority:** `GET /api/v1/expenses` (`ExpenseService.get_expenses_for_user`, `varavu_selavu_service/services/expense_service.py:95-96`) filters only on `Expense.user_email`, with **no `group_id IS NULL` guard**. `AnalysisService._compute_personal_leg` (`analysis_service.py:75-81`) already has this exact guard (added in TS-GRP-106) with a comment explaining why it's required, but the same fix was never applied to `ExpenseService`'s list/update/delete methods. Net effect, verified live against the dev Postgres DB: creating a single group expense makes it appear a second time in ExpensesPage's **Personal** scope table (with edit/delete icons that would corrupt the group's split if used) and a second time in the Dashboard's "Recent Transactions" unified feed (once as an untagged personal row, once as the correctly-badged group row) — i.e. `scope=personal` behavior is *not* byte-for-byte unaffected once a user has any group expenses. `scope=personal`/`scope=combined` on `GET /analysis` are unaffected (verified $0 / $90 respectively) since `AnalysisService` has its own, correct filter. Fix: add `Expense.group_id.is_(None)` to the filter in `expense_service.py:96` (and likely the sibling update/delete methods in the same file). Spawning a follow-up task for this.
- Manual smoke test performed end-to-end against a live backend + Postgres dev DB (temporarily flipped `GROUPS_ENABLED=true`, restored to `false` after): registered a user, created a group, added a member-equal-split group expense via the Personal/Group toggle in the Add Expense dialog, confirmed it posted to `POST /groups/{id}/expenses`, confirmed it appears in ExpensesPage's Groups scope with the group badge, confirmed Dashboard's combined total and My Groups widget update, confirmed the explainer toast appears once. Also hit the backend-listing bug described above in the process.
