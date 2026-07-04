# TS-GRP-108 — Web: dashboard/expenses scope integration + receipt group toggle

**Phase:** 1 · **Build order:** 8th · **Spec:** §11.2, §8.4, §10.1, §17.1

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
