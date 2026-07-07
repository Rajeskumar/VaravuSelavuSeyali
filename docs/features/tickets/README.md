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

---

# Phase 2 — Parity & Differentiation

Source: spec §16 Phase 2 list, cross-referenced against the Phase-1 code actually shipped (see `docs/FEATURE_STATUS.md` §6 for the as-built state each of these extends). All tickets below are 📋 **Planned** — none of this is started.

| Order | Ticket | Title | Depends on |
|:--|:--|:--|:--|
| 1 | [TS-GRP-113](TS-GRP-113-shares-adjustment-splits.md) | SplitEngine: `shares` + `adjustment` split types | 103, 104 |
| 2 | [TS-GRP-114](TS-GRP-114-multiple-payers.md) | Multiple payers on a group expense | 104 |
| 3 | [TS-GRP-115](TS-GRP-115-itemized-splits-backend.md) | Itemized receipt group expenses (backend) | 101, 104, 114 |
| 4 | [TS-GRP-118](TS-GRP-118-simplify-debts-and-group-settings.md) | Simplify-debts + group settings (default split) | 102, 104 |
| 5 | [TS-GRP-119](TS-GRP-119-activity-feed.md) | Activity feed (writes + `GET /activity` + UI) | 102, 104, 105 |
| 6 | [TS-GRP-120](TS-GRP-120-recurring-group-expenses.md) | Recurring group expenses | 104, 110 |
| 7 | [TS-GRP-121](TS-GRP-121-personal-group-conversion.md) | Convert personal ↔ group expense | 104, 106, 108 |
| 8 | [TS-GRP-122](TS-GRP-122-archive-restore-groups.md) | Group archive & restore (30-day window) | 102 |
| 9 | [TS-GRP-123](TS-GRP-123-insights-group-shares.md) | Item/Merchant Insights fed by group shares | 104, 115 |
| 10 | [TS-GRP-124](TS-GRP-124-ai-analyst-group-context.md) | AI Analyst: full group context expansion | TS-ANL-013, 104 |
| 11 | [TS-GRP-116](TS-GRP-116-web-itemized-and-split-parity.md) | Web: shares/adjustment/multi-payer UI + `ItemSplitBoard` | 107, 113, 114, 115 |
| 12 | [TS-GRP-117](TS-GRP-117-mobile-itemized-and-split-parity.md) | Mobile: shares/adjustment/multi-payer UI + item split board | 109, 113, 114, 115, 116 |

Notes:
- 113/114/115 (the math + schema) are front-loaded so 116/117 (the UI that calls them) aren't built against a moving target.
- 119 (activity feed) is a prerequisite for **TS-GRP-127** in Phase 3 (edit history is designed to read `group_activity`, not a new table).
- 123 depends on 115 because itemized `expense_item_splits` is the data source for per-member item-insight shares; simple (non-itemized) group expenses only need 104.

---

# Phase 3 — Polish & Growth

Source: spec §16 Phase 3 list. These are backlog-depth, not sprint-ready in the way Phase 1/2 are — several encode an explicit design decision the ticket derives (not spec-prescribed) that's worth a quick confirm before implementation. **TS-GRP-135 is conditional** — see its own file for why it shouldn't be picked up speculatively.

| Ticket | Title | Depends on |
|:--|:--|:--|
| [TS-GRP-125](TS-GRP-125-notification-preferences.md) | Notification preferences (per-group mute, per-event toggles) | 110 |
| [TS-GRP-126](TS-GRP-126-expense-comments.md) | Expense comments | 104, 110, 119 |
| [TS-GRP-127](TS-GRP-127-expense-edit-history.md) | Per-expense edit history (reads `group_activity`, no new table) | 119 |
| [TS-GRP-128](TS-GRP-128-cross-group-friend-balances.md) | Cross-group friend balances (`GET /friends/balances`) | 104, 114 |
| [TS-GRP-129](TS-GRP-129-settle-by-expense.md) | Settle-by-expense (mark specific expenses settled) | 105, 104, 114 |
| [TS-GRP-130](TS-GRP-130-payment-deep-links.md) | Payment deep links (Venmo/PayPal/UPI) | 105 |
| [TS-GRP-131](TS-GRP-131-multi-currency-groups.md) | Multi-currency groups | 104, 106 |
| [TS-GRP-132](TS-GRP-132-csv-export.md) | CSV export (group expenses + settlements) | 104, 105 |
| [TS-GRP-133](TS-GRP-133-ai-split-suggestions.md) | AI split suggestions (item→member from history) | 115, 116, 117 |
| [TS-GRP-134](TS-GRP-134-change-insights-group-aware.md) | Change Insights: group-aware copy | 106, 123 |
| [TS-GRP-135](TS-GRP-135-materialized-balances.md) | Materialized group balances — **conditional, perf-triggered only** | 104, 105, 113, 114, 115, 118 |

## Cross-cutting call-outs

- **TS-GRP-131 (multi-currency)** is the largest, least-specified ticket in this backlog — its own file recommends a short product/design check-in before implementation, not just an engineering read.
- **TS-GRP-135 (materialized balances)** should only be picked up if real usage data shows on-request balance computation is actually slow — building it speculatively adds an ongoing correctness-drift risk (every future balance-affecting write must remember to update the cache) for no proven benefit.
- Several Phase 3 tickets note a scope decision the ticket author derived rather than found in the spec (e.g. comment-deletion policy in TS-GRP-126, the settle-by-expense schema in TS-GRP-129, the payment-handle storage in TS-GRP-130). These are flagged inline in each file — skim for "Design decision" / "recommend" call-outs before implementing.
