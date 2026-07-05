# TS-GRP-109 — Mobile: Groups screens + split editor + deep-link invites

**Phase:** 1 · **Build order:** 9th · **Spec:** §12.1, §12.2, §11 (parity) · **Status:** ✅ Completed

## Implementation notes (post-build)

- **Stats and Activity tabs omitted (Phase 1 optional).** Spec §12.2 lists them as optional for Phase 1. `GroupDetailScreen` ships with Expenses + Balances tabs only. These are left for a follow-up.
- **Group expense payer in AddExpenseScreen uses first split member as payer.** In Phase 1, the mobile Add Expense sheet doesn't query the group members list before submission (that would require an extra API call on group selection). As a simplification, the first selected split member is used as the payer. A future improvement should query `GET /groups/{id}` on group selection and resolve the current user's `member_id`, matching the web flow.
- **`expo-linking` is an Expo SDK 54 built-in** (part of `expo` package). No separate `npm install` was needed. The `trackspense://` scheme is registered in `app.json` (`scheme` field + Android `intentFilters`). The `linking` config is set on `NavigationContainer` in `App.tsx`.
- **`analysis.ts` extended with `scope` and `group_id` params** (TS-GRP-106 parity). Additive-only — existing callers that don't pass `scope` continue to get `scope=personal` from the backend default. No screen was changed to use `scope=combined` (that belongs to a later AnalysisScreen update, similar to TS-GRP-108 for web).
- **GROUPS_ENABLED gate in AddExpenseScreen** uses the `useQuery(['groups'])` cache — same cache key as GroupsScreen — so there is no additional network round-trip when both screens are mounted. The toggle only renders if the query succeeded (i.e., the backend returned 200, not 404).
- **Test coverage:** 11 tests, all passing. 6 cover the §3.3 equal-share invariant across edge cases (2 members, 3 members with penny remainder, 7 members, 0 members, 1 member, large amounts). 5 cover deep-link URL parsing.

## Scope

Mobile (Expo/React Native) parity for Phase 1 groups: Groups list, Group detail (Expenses / Balances tabs), split editor, settle-up sheet, scope-aware analysis, and deep-link invite handling. Charts reuse existing chart components.

## Files it will touch

- **New screens:** `varavu_selavu_mobile/src/screens/GroupsScreen.tsx`, `GroupDetailScreen.tsx`.
- **New components:** `varavu_selavu_mobile/src/components/` — `SplitEditor` (RN; native-optimized — steppers/sliders), `BalanceRow`, `SettleUpSheet` (bottom sheet). Reuse existing chart components referenced by `AnalysisScreen.tsx` / insights screens for the two-series my-share/group-total variant (Phase 1: keep charts minimal — Stats tab is optional).
- `varavu_selavu_mobile/App.tsx` — register `GroupsScreen`/`GroupDetailScreen` in the native-stack (`App.tsx:36-52`) and add a **👥 Groups** item to the custom drawer (`CustomDrawer`, `App.tsx:398+`). Group detail uses top tabs (Expenses / Balances) consistent with the existing tab pattern.
- **New API client:** `varavu_selavu_mobile/src/api/groups.ts` — follow the existing pattern using the `apiFetch.ts` wrapper (`src/api/apiFetch.ts`) and `apiconfig.ts`; mirror `src/api/expenses.ts` / `src/api/analysis.ts`.
- `varavu_selavu_mobile/src/api/analysis.ts` — add `scope`/`group_id` params (TS-GRP-106).
- `varavu_selavu_mobile/src/screens/AddExpenseScreen.tsx` — add the Personal/Group toggle + split editor (equal for Phase 1), submitting to `POST /groups/{id}/expenses`.
- **Deep linking:** add `expo-linking` (NOT currently in `package.json`) and configure the `trackspense://join/{token}` scheme + universal-link fallback so invites open `JoinGroup`. Confirm/添加 the `scheme` in `app.json`/`app.config`.

> Note: `expo-notifications` registration/handling is **TS-GRP-110**, not this ticket — but the two land together for the mobile Phase-1 exit. Keep the API client (`groups.ts`) and navigation additions here so 110 only adds the notifications layer.

## Acceptance criteria

- Drawer shows Groups → `GroupsScreen` lists the user's groups with balances; tap → `GroupDetailScreen` with Expenses + Balances tabs.
- Add a group expense (equal split) from `AddExpenseScreen`; it appears in the group and in combined analysis (`AnalysisScreen` scope).
- `SettleUpSheet` records a settlement and refreshes balances.
- Tapping `trackspense://join/{token}` (cold and warm start) routes to invite acceptance; post-login resume works.
- All group nav/entry points gated by `GROUPS_ENABLED` (fetched from backend/config) — hidden when off.
- Uses `apiFetch.ts` for auth so the JWT is attached consistently with existing screens.

## Dependencies

- **TS-GRP-102/104/105** (backend contracts), **TS-GRP-106** (scope). Pairs with **TS-GRP-110** for the mobile Phase-1 exit.
- New dep: `expo-linking` (Expo SDK 54 compatible).

## Test requirements

- RN component tests where the project supports them (match whatever test setup exists under `varavu_selavu_mobile`; if none, add a minimal Jest + React Native Testing Library setup for `SplitEditor` validation and `GroupsScreen` render).
- Deep-link unit test: token URL → parsed route params.
- Manual device/simulator smoke: create group (or accept invite) → add equal-split expense → view balances → settle up; verify combined analysis reflects the share.
