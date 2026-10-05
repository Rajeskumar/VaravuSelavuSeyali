# TrackSpense — Architecture & Engineering Conventions

An engineering summary for developers and AI agents. Read it when a task needs this context; it isn't meant to be loaded every session. Product description: [README.md](../README.md). Hosting, DNS and CI: [INFRASTRUCTURE.md](INFRASTRUCTURE.md). Full spec: [TrackSpense_Complete_Product_Specification.md](TrackSpense_Complete_Product_Specification.md).

## Components
- **Backend** `varavu_selavu_app/` — FastAPI + SQLAlchemy 2 + Alembic on Postgres (schema `trackspense`, hosted on Supabase), Poetry, Python ≥3.10. Entry point `varavu_selavu_service/main.py`. Layers: `api/` (routers) → `services/` (business logic) → `db/models.py`; Pydantic DTOs live in `models/api_models.py`.
- **Web** `varavu_selavu_ui/` — React 19 (CRA), MUI 7, TanStack Query, react-router 6, Plotly.
- **Mobile** `varavu_selavu_mobile/` — Expo SDK 57 / React Native 0.86 (New Architecture, Hermes), React Navigation 7, TanStack Query. Local native module `modules/receipt-ocr` (Apple Vision on iOS, ML Kit on Android).
- **QA** `qa/` — Playwright end-to-end and API suites (CI: `.github/workflows/qa.yml`).
- **Infra** — GCP Cloud Run (backend and web), Cloud Build (`cloudbuild*.yaml`), Cloudflare DNS. There are no cron jobs; everything is request-triggered.

## Cross-cutting flows
- **Auth** — JWT (HS256). The web app uses HttpOnly `vs_token` cookies plus a double-submit CSRF cookie (`vs_csrf`); mobile sends a Bearer token kept in SecureStore. Routes depend on `auth_required`, which returns the user's **email**.
- **Requests** — clients → REST `/api/v1/*` → services → Postgres. Item/merchant insights are pre-aggregated at save time by FastAPI `BackgroundTasks` (`insights_aggregation_service.py`).
- **AI chat** — a LangGraph ReAct agent (`services/chat_service.py`) with read tools and create-expense tools. Gemini by default, OpenAI/Ollama optional.
- **AI cost gating** — every LLM call goes through `services/ai_quota_service.py` (per-user daily quota, global daily $ cap, `AI_ENABLED` kill switch).
- **Categorization** — per-user memory → merchant dictionary → keyword rules → LLM fallback (`services/category_rules/`).
- **Receipts** — `OCR_ENGINE=hybrid`: RapidOCR + `receipt_text_parser.py`, with Gemini only when parser confidence is low. Mobile runs OCR on-device and posts the text lines to `/ingest/receipt/parse_ocr`.

## Design patterns in use
- **Pure domain engines, no DB/HTTP**, so they can be unit-tested directly: `split_engine.py`, `item_split_engine.py`, `card_rewards_engine.py`, `receipt_text_parser.py`, `category_rules/`.
- **FastAPI dependency injection** — `get_*_service` factories in `api/routes.py` build a service per request around a DB `Session`. `repo/postgres_repo.py` exists but only some routes use it; most services query the DB directly.
- **Env feature flags**, read fresh through `Settings()` on each request:
  - `require_*_enabled` dependencies gate the server side.
  - `GET /api/v1/config` plus `use*Enabled` hooks hide the UI in both clients.
  - Flags: `GROUPS_ENABLED`, `BUDGETS_ENABLED`, `CARD_COACH_ENABLED`, `TAGS_ENABLED`, `ENTITY_RESOLUTION_ENABLED`, `AI_ENABLED`.
- **Reserve → call → settle/refund** around metered LLM calls (`AiQuotaService`, an atomic conditional upsert).
- **Tiered fallback chains**, cheapest deterministic tier first: categorization and OCR.
- **Structured error details** — AI gating errors return `{detail: {code, ...}}`, parsed by `aiErrorFromResponse` in each client's `src/api/aiUsage.ts`.
- **Mirrored API clients** — web and mobile each keep their own `src/api/*.ts` with matching shapes.

## Testing
- **Backend:** `make test-backend` runs `pytest` on in-memory SQLite. `tests/conftest.py` overrides `get_db`/`auth_required`, and the test user is `test@user.com`.
- **Postgres-only behaviour:** `tests/*_e2e_pg.py`, skipped unless `E2E_DATABASE_URL` is set; run them via `varavu_selavu_app/run_e2e_pg_tests.sh`.
- **Clients:** web uses Jest/RTL (`react-scripts test`); mobile uses Jest. End-to-end coverage is Playwright in `qa/`.
- **Git hooks** (`.githooks/`, enabled with `make install-hooks`): `scripts/pre-commit.sh` runs `test-backend` / `typecheck-web` / `typecheck-mobile` for the staged areas on commits to main. `scripts/pre-push.sh` runs `make release-check` (pytest + audits) on pushes to main, and refuses a `release-*` tag push unless GitHub Actions' QA workflow passed on that commit. `make release-check-full` adds the local QA suites.
- **Local verification:** use a scratch Postgres with `Base.metadata.create_all` (Alembic can't upgrade from an empty DB).

## Conventions
- **Ticket IDs:** `TS-<AREA>-<n>` (e.g. TS-CARD-114); security findings use VS-01..VS-16. Specs live in `docs/features/`, and the status board is `docs/FEATURE_STATUS.md`.
- **Comments explain *why*** and are often long; match the surrounding density.
- **Make targets:** `make start-backend` / `start-web` / `start-mobile-*` / `test-backend`.
- **Unclear, worth confirming:** `shared/tokens.ts` appears unused by either client.
