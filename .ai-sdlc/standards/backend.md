# Backend standard

`varavu_selavu_app/` — FastAPI, SQLAlchemy 2, Alembic, Postgres (schema `trackspense`), Poetry, Python ≥3.10.

- New route: thin handler in `api/*routes.py`, `Depends(auth_required)` (returns the email), service via a `get_*_service` factory, request/response Pydantic models. Reject unknown/extra input where the model is user-facing.
- Authorization is explicit per resource: the row must belong to the caller, or the caller must be a group member with the needed role. Never trust ids from the body for ownership.
- Money: `Decimal` in, `Decimal` out, quantised via `core/money.py`; negative/zero/overflow rejected (amount validation tests exist). Serialise as strings/numbers consistently with existing DTOs.
- User text that reaches HTML/CSV/emails/LLM prompts passes through `core/text_sanitize.py`, `csv_safety.py`, `upload_safety.py` as appropriate.
- Flagged features add a `require_*_enabled` dependency and a `/config` entry.
- LLM calls only via `ai_quota_service` (reserve/settle/refund) and the topic-scope guard in `chat_service`.
- Group expense PUT: omit `payers` and `split` together to keep the stored split.
- Notifications: every path creating a group expense calls `NotificationService.fan_out(description=...)`.
- **Migrations:** `alembic revision` with random-hex id; schema-qualified; reversible `downgrade`; additive and backward-compatible with the *previous* deployed code (migrations run before the new service ships); no long table locks (add nullable → backfill → constrain); data backfills idempotent; tests/local DB use `Base.metadata.create_all`, Alembic can't upgrade from empty.
- Logging: no tokens, passwords, receipt text or full emails in logs; log ids and outcomes.
