# Architecture standard

Source of truth: `docs/ARCHITECTURE.md` (components, flows, patterns) and `docs/INFRASTRUCTURE.md` (hosting/CI). Read those for context; this file is the rules.

- **Layering (backend):** `api/` routers → `services/` business logic → `db/models.py`. DTOs in `models/api_models.py`. No business logic in routers; no HTTP/DB in the pure engines (`split_engine`, `item_split_engine`, `card_rewards_engine`, `receipt_text_parser`, `category_rules/`).
- **Identity is the user's email** (FK `users.email`) — legacy and pervasive; do not "fix" it piecemeal. Derive the user from the token, never from a client-supplied id.
- **Money is `Decimal`** (`core/money.py`), never float, end to end; clients format via their `money` utils.
- **Every LLM call goes through `services/ai_quota_service.py`** (reserve → call → settle/refund). New LLM features inherit quota, cap and kill switch.
- **Feature flags** are read per request through `Settings()`: server `require_*_enabled` + `GET /api/v1/config` + client `use*Enabled` hooks.
- **Two clients, mirrored API layers** (`src/api/*.ts` in web and mobile). A contract change updates both plus `docs/` spec.
- **Background work** is request-triggered (`BackgroundTasks`); there are no cron jobs. Do not assume a scheduler.
- **Schema:** all tables in Postgres schema `trackspense`; Alembic revision ids are random hex; migrations run before deploy via the `migrate-db` Cloud Run Job.
- **Decisions that must be recorded** in AGENTS.md "Key Decisions": new patterns, constraints, deliberate trade-offs.
