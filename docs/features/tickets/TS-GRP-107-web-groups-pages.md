# TS-GRP-107 — Web: GroupsPage / GroupDetailPage + SplitEditor

**Phase:** 1 · **Build order:** 7th · **Spec:** §11.1, §11.3, §9.3

## Scope

New web surfaces for groups: a groups list, a group detail page (Expenses + Balances tabs for Phase 1), and the `SplitEditor` component (equal/exact/percentage tabs with live validation + rounding preview). MUI v7 + existing glassmorphism theme.

Phase-1 tabs only: **Expenses** and **Balances**. (Analytics / Activity / Settings tabs are Phase 2/3.)

## Files it will touch

- **New pages:** `varavu_selavu_ui/src/pages/GroupsPage.tsx`, `varavu_selavu_ui/src/pages/GroupDetailPage.tsx`, `varavu_selavu_ui/src/pages/JoinGroupPage.tsx` (invite acceptance).
- `varavu_selavu_ui/src/App.tsx` — register routes `"/groups"`, `"/groups/:id"`, `"/groups/join/:token"`, wrapped in `<RequireAuth><MainLayout …>` exactly like the existing routes (`App.tsx:160-167`). `JoinGroupPage` must handle the pre-login → post-auth deep-link case.
- **New API client:** `varavu_selavu_ui/src/api/groups.ts` — functions for the TS-GRP-102/104/105 endpoints, following the existing client pattern in `src/api/expenses.ts` / `src/api/analysis.ts` (shared base/config from `src/api/apiconfig.ts` + `src/api/api.ts`, JWT header handling already centralized there).
- **New components** under `varavu_selavu_ui/src/components/` (new `groups/` subfolder): `GroupCard`, `MemberAvatarStack`, `SplitEditor` (equal/exact/percentage tabs — the complex one), `BalanceList`, `SettleUpDialog`, `InviteDialog`.
  - `SplitEditor` shows a **client-side rounding preview** but the server is authoritative (§7.3); it must display the same result the backend returns and surface `400` per-field errors from the API.
- Navigation entry: add a **👥 Groups** item to the existing drawer/nav in `src/components/layout/` so `/groups` is reachable.
- `MemberAvatarStack` uses initials + deterministic color from member UUID (§11.3).

## Acceptance criteria

- `/groups` lists the user's groups (name, type, member count, my balance chip) with a Create-group action; empty state renders when the user has no groups.
- Create group → add members (registered email or placeholder name) → invite link via `InviteDialog`.
- `/groups/:id` shows Expenses and Balances tabs: Expenses lists group expenses with **my share** primary and full amount secondary; Balances shows per-member net + a Settle Up CTA opening `SettleUpDialog`.
- `SettleUpDialog` records a settlement (TS-GRP-105) and refreshes balances.
- `SplitEditor` validates equal/exact/percentage locally (percent must total 100, exact must total amount) and previews rounded per-member amounts; on submit, backend `400`s are shown inline per field.
- `/groups/join/:token` accepts an invite (works when hit pre-login: redirect to login, then resume) and lands on the group.
- All group UI entry points are hidden when the `GROUPS_ENABLED` flag is off (TS-GRP-111 provides the flag surface to the client).

## Dependencies

- **TS-GRP-102** (groups/members/invites), **TS-GRP-104** (expenses/balances), **TS-GRP-105** (settlements). Backend contracts must be stable first.

## Test requirements

- Component tests alongside existing ones (repo already uses CRA/Jest — see `src/pages/ExpensesPage.test.tsx`, `setupTests.js`): `SplitEditor` validation (percent≠100, exact≠total, rounding preview), `GroupsPage` render/empty-state, `SettleUpDialog` submit.
- Mock `api/groups.ts` in tests (pattern used by existing page tests).
- Manual/e2e smoke: create group → add member → add equal-split expense → view balances → settle up.
