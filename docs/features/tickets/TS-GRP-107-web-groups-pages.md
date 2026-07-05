# TS-GRP-107 — Web: GroupsPage / GroupDetailPage + SplitEditor

**Phase:** 1 · **Build order:** 7th · **Spec:** §11.1, §11.3, §9.3 · **Status:** ✅ Completed

## Implementation notes (post-build)

- **The "hide when `GROUPS_ENABLED` is off" acceptance criterion assumes a client-visible flag surface that doesn't exist yet.** The ticket says "TS-GRP-111 provides the flag surface to the client," but TS-GRP-111 isn't a listed dependency and hasn't been built — there's no `/config`-style endpoint or login-response field exposing the flag today. Resolved pragmatically: the nav entry and routes are registered unconditionally (matching every other nav item), and `GroupsPage` treats a `404` from `GET /groups` (which is exactly what the backend returns when the flag is off, per TS-GRP-102) as a distinct "Groups isn't available yet" empty state rather than crashing. This is a real, working feature-detection fallback, not the dedicated flag surface the ticket describes — worth deciding whether TS-GRP-111 still needs to build a proper flag surface or whether this 404-based detection is sufficient.
- **New pure utility not in the ticket's file list:** `utils/splitPreview.ts` — a JS port of `SplitEngine`'s largest-remainder rounding algorithm (§3.5), extracted so `SplitEditor`'s live preview is unit-testable independent of the component and demonstrably matches the backend's cent-exact behavior (see its test file, which mirrors `test_split_engine.py`'s own cases).
- **`LoginPage.tsx` touched, not listed in the ticket's file list, but required** for "`JoinGroupPage` must handle the pre-login → post-auth deep-link case." The app had no existing "return to X after login" mechanism at all; added one narrowly scoped to the invite flow (`sessionStorage` pending-token check in `postLoginDestination()`), leaving the default `/dashboard` post-login behavior unchanged for every other case.
- **New `api/groups.ts` preserves backend error detail** (`ApiError` with `.status`/`.detail`) instead of collapsing to a generic string like the older `api/expenses.ts`/`api/recurring.ts` clients do — necessary so `SplitEditor`/dialogs can surface the backend's actual `SplitError` messages. Deliberately did not touch the older clients to keep personal-expense behavior unchanged.
- **Manual smoke test performed end-to-end** against a real local Postgres (`trackspense_dev`, already migrated to the latest schema) with `GROUPS_ENABLED=true` temporarily: register → login → create group → add placeholder member → generate invite link → add an equal-split group expense ($90 → $45/$45 live preview, matching backend exactly) → Balances tab (correct net per member + pairwise transfer) → Settle Up (balances correctly zero out afterward). No console errors at any step. `.env`/test data reverted after.
- **Two pre-existing test failures found, confirmed unrelated:** `src/App.test.js` and `src/pages/ExpensesPage.test.tsx` fail identically on the unmodified base commit (verified via `git stash`) — a stale confirm-dialog/test mismatch predating this ticket, in personal-`ExpensesPage` territory (TS-GRP-108, not this ticket). Not fixed here to stay in scope; flagged for a separate fix.
- **Added a `backend` entry to `.claude/launch.json`** (poetry/uvicorn on port 8080) alongside the existing `web-ui`/`mobile-web` entries — needed for the manual smoke test above, and left in as a reusable dev convenience.

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
