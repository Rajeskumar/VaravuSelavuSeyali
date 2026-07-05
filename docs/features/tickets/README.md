# TrackSpense Groups — Phase 1 Implementation Tickets

Tickets for **Phase 1 (MVP "Split the Bill")** of the Groups / Shared-Expenses feature.
Source spec: [`../TrackSpense_Groups_Product_Spec.md`](../TrackSpense_Groups_Product_Spec.md) (v0.9.2, reconciled against the live codebase).

Every ticket below is grounded in the **actual repo structure**, not the spec's illustrative DDL/paths:

- **Backend:** `varavu_selavu_app/varavu_selavu_service/` — ORM in `db/models.py`, migrations via **Alembic** (`varavu_selavu_app/alembic/`, `env.py` uses `include_schemas=True`, `version_table_schema="trackspense"`), services in `services/*.py`, single router `api/routes.py` (`prefix="/api/v1"`, DI providers), auth in `auth/security.py` (`auth_required` → JWT `sub` = email), Pydantic in `models/api_models.py`, config in `core/config.py`, rate limiter in `core/limiter.py`. Tests in `varavu_selavu_app/tests/` run on **SQLite in-memory** (`conftest.py`, `schema_translate_map {trackspense→None}`, `Base.metadata.create_all`); PG e2e via `run_e2e_pg_tests.sh`.
- **Web:** `varavu_selavu_ui/src/` — React Router in `App.tsx` (`RequireAuth` + `MainLayout` wrappers), `pages/`, `components/{layout,dashboard,expenses,analysis,common,ai-analyst}`, API clients in `api/`.
- **Mobile:** `varavu_selavu_mobile/` — Expo SDK 54, React Navigation v6 (native-stack + bottom-tabs + custom drawer in `App.tsx`), `src/screens/`, `src/api/` (fetch wrapper `apiFetch.ts`). **`expo-notifications`, `expo-linking`, `expo-device` are NOT yet installed.**

## Execution order (IDs unchanged; build order resequenced per §16)

| Order | Ticket | Title | Depends on |
|:--|:--|:--|:--|
| 1 | [TS-GRP-103](TS-GRP-103-split-engine.md) | SplitEngine (pure, no DB) | — |
| 2 | [TS-GRP-101](TS-GRP-101-schema-migration.md) | ORM models + Alembic migration | — |
| 3 | [TS-GRP-102](TS-GRP-102-group-service.md) | GroupService + repo (CRUD, membership, invites) | 101 |
| 4 | [TS-GRP-105](TS-GRP-105-settlements.md) | Settlements record/list | 101, 102 |
| 5 | [TS-GRP-104](TS-GRP-104-group-expenses-balances.md) | Group expense endpoints + BalanceService | 101, 102, 103, 105 |
| 6 | [TS-GRP-106](TS-GRP-106-analysis-scope.md) | AnalysisService scope + cache key + `group_id IS NULL` guard | 101, 104 |
| 7 | [TS-GRP-107](TS-GRP-107-web-groups-pages.md) | Web GroupsPage/GroupDetailPage + SplitEditor | 102, 104, 105 |
| 8 | [TS-GRP-108](TS-GRP-108-web-scope-integration.md) | Web dashboard/expenses scope + receipt toggle | 106, 107 |
| 9 | [TS-GRP-109](TS-GRP-109-mobile-screens.md) | Mobile screens + deep-link invites | 102, 104, 105, 106 |
| 10 | [TS-GRP-110](TS-GRP-110-notifications.md) | NotificationService + device_tokens + Expo push | 101, 104, 105, 109 |
| 11 | [TS-GRP-111](TS-GRP-111-feature-flag-rollout.md) | Feature flag, e2e tests, staged rollout | all |
| — | [TS-GRP-112](TS-GRP-112-account-deletion-cleanup.md) | Account-deletion group-aware cleanup (fix to existing `AuthService.delete_user`) | 101 |

TS-GRP-112 isn't part of the main dependency chain — it's a fix to an **existing, already-shipped** endpoint (`/auth` account deletion) whose behavior silently regressed once TS-GRP-101 changed `expenses.user_email`/`expense_items.user_email` from `ON DELETE CASCADE` to `ON DELETE SET NULL`. It only needs 101 to be merged and can run any time after that, in parallel with 102+.

**Rollout gate:** `GROUPS_ENABLED` stays OFF until TS-GRP-106 is merged (the `group_id IS NULL` guard prevents personal/combined analytics double-counting). See §9.1 / §16.

Phase 2 and Phase 3 items are **backlog** and intentionally excluded here (shares/adjustment splits, multiple payers, itemized receipt splits, simplify-debts, activity feed, recurring group expenses, personal↔group conversion, AI Analyst group context, notification preferences, etc.).
