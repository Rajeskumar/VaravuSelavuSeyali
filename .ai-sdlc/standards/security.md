# Security standard

Context: financial data + group sharing + LLM features. Prior audit: VS-01..VS-16 (all remediated); see `docs/product_review&testing_report/`.

## Auth and session
- JWT HS256. Web: HttpOnly `vs_token` cookie + double-submit CSRF (`vs_csrf`, `core/csrf.py`). Mobile: `Authorization: Bearer`, which wins over the cookie and is exempt from CSRF. Keep both behaviours; mobile sends `credentials: 'omit'`.
- Identity comes from the token only. **Never trust a client-supplied `user_id`/email for ownership.**
- Rate limits are per IP, in memory per instance (`core/limiter.py`); the Postgres-backed AI quota is the real cost guard. New auth-adjacent endpoints get a limit.
- Tokens, cookies and secrets never in logs, URLs or `localStorage`.

## Authorization (the usual P0)
Every read/write of a user-owned or group-owned row checks the caller's ownership/membership **and role**, including list, export, comment, settle-up, notification and "by id" endpoints. Archived/removed members lose access. Look for IDOR: any route taking an id without a membership join.

## Input and output
Pydantic validation; `text_sanitize`, `csv_safety` (formula injection), `upload_safety` (type/size/content for receipts) on the matching paths; parameterised SQL only; escape/sanitise HTML (`utils/html.ts` on web); no `dangerouslySetInnerHTML` with unsanitised data (the chat renders formatted Markdown — keep `formatMarkdown` escaping).

## LLM-specific
Only through `ai_quota_service`; model choice limited to `AI_CHAT_ALLOWED_MODELS`; chat can create but never update/delete expenses; prompts treat user/receipt text as data; topic scope guard stays; no raw provider errors to clients.

## Secrets and supply chain
No secrets in git (service-account JSON and `.env` files are gitignored; the web/mobile `.env` hold only public config). Dependencies: `make audit-all` (pip-audit, npm audit gated at high; mobile allowlist rules in AGENTS.md). Never `npm audit fix --force` on mobile.

## Review output
Exploit scenario (who, what request, what they get), severity, Confirmed/Suspected, fix. Anything that exposes another user's data or lets a user change money they don't own is P0.
