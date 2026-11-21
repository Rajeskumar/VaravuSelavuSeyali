# TrackSpense — MCP Integration Review (Phase 0)

> **Status:** Architecture review. No application code was changed.
> **Date:** 2026-11-21 · **Branch:** `claude/trackspense-mcp-architecture-gwioer`
> **Companion docs:** [mcp-tool-specification.md](mcp-tool-specification.md) · [mcp-security-design.md](mcp-security-design.md) · [mcp-implementation-plan.md](mcp-implementation-plan.md)
>
> Every finding below was checked against the repository at this commit. Paths are repo-relative;
> `routes.py` means `varavu_selavu_app/varavu_selavu_service/api/routes.py` unless stated.

---

## 0. Corrections to the brief's assumptions

The brief listed several assumptions. Three of them are wrong, and they change the design materially.

| Brief assumed | Actually in the repo | Consequence for the MCP design |
|---|---|---|
| **Google Sheets** is the database | **Supabase Postgres** via SQLAlchemy 2 + Alembic, schema `trackspense` (`docs/ARCHITECTURE.md`, `db/session.py`, `db/models.py`, 27 Alembic revisions). Nothing in the backend uses Google Sheets; the only "Sheets" string is a stale comment at `routes.py:194`. | Transactions, unique constraints and atomic upserts are already available. Idempotency, approvals, audit and rate counters can live in the **same database** as expenses and commit **in the same transaction**. You don't need a second datastore, and you don't need a migration. |
| The API is at `https://expense.cerebroos.com` | `expense.cerebroos.com` is the **React SPA** (nginx, Cloudflare-proxied CNAME). The API is **`trackspense-api.cerebroos.com`**, a Cloud Run domain mapping that is **DNS-only (not proxied by Cloudflare)** (`docs/INFRASTRUCTURE.md` §4). | `/mcp` belongs on `trackspense-api.cerebroos.com`. Cloudflare WAF and rate limiting do **not** sit in front of the API today. |
| "JWT-based authentication" is enough to build on | It's HS256 first-party JWTs with **no `iss`/`aud`**, cookie or Bearer, with server-side revocation via `users.token_valid_after` (`auth/security.py:64-170`). | That works for first-party clients but **can't** be handed to third-party agents. MCP needs its own audience-bound, scoped, per-connection tokens (see security design §3). |

Other stack facts confirmed: FastAPI 0.141, Pydantic v2, Python ≥3.10, Cloud Run `us-central1` with min 1 and max 20 instances at 1 vCPU / 512 Mi each, secrets in GCP Secret Manager, no cron jobs (everything is request-triggered).

---

## 1. Existing architecture

```
Web SPA (expense.cerebroos.com) ──cookie+CSRF──┐
Mobile (Expo) ───────────────Bearer────────────┼──► FastAPI (trackspense-api.cerebroos.com)
                                               │     /api/v1/*  routers  (api/, auth/)
                                               │        │ Depends(auth_required) → user email
                                               │        ▼
                                               │     services/*  (business logic, Session per request)
                                               │        ▼
                                               │     db/models.py ──► Supabase Postgres (schema trackspense)
                                               │
                                               └── LLM calls only via services/ai_quota_service.py
```

| Concern | Where | Notes |
|---|---|---|
| Entry point | `varavu_selavu_app/varavu_selavu_service/main.py` | Security headers, CSRF middleware, CORS, slowapi limiter (decorator-only; **no** `SlowAPIMiddleware`, so `default_limits` does not apply globally). `/docs` exists only when `ENVIRONMENT=local`. |
| Root router | `routes.py:123` `APIRouter(prefix="/api/v1")` | Includes `auth`, `groups`, `friends`, group-conversion, `devices` and `entity_resolution` routers. |
| DI factories | `routes.py:131-185` `get_*_service` | Builds one service per request around the request `Session`. |
| Session | `db/session.py` `SessionLocal`, `get_db` | Sync SQLAlchemy and sync route handlers (FastAPI runs them in its threadpool). |
| Feature flags | `core/config.py` `Settings()` read fresh per request; `require_*_enabled` deps | `GROUPS_ENABLED` (default False), `BUDGETS_ENABLED`, `CARD_COACH_ENABLED`, `TAGS_ENABLED`, `ENTITY_RESOLUTION_ENABLED`, `AI_ENABLED`. |

### 1.1 Authentication and tenant isolation

- **Identity is the email** (`users.email`, the FK used everywhere). `auth_required` (`auth/security.py:113`) decodes the token, allowing `HS256` only, checks `type == "access"`, and checks `iat_ms` against `users.token_valid_after` (one indexed lookup per request). It returns the email.
- **The token source is the Bearer header, falling back to the `vs_token` cookie.** CSRF is double-submit (`core/csrf.py`), and Bearer requests are exempt.
- **Refresh tokens** rotate with family-based reuse detection in the DB (`db/models.py:520` `RefreshToken`, `auth/service.py:331`).
- **Tenant isolation pattern:** every personal query filters `Expense.user_email == user_id AND Expense.group_id IS NULL` (e.g. `expense_service.py:82,157`, `routes.py` `_get_owned_personal_expense`). Group data is reached through `GroupMember.user_email` joins (`analysis_service.py:184-210`). Non-members get 404 (a key decision in AGENTS.md).
- **Client-supplied identity is ignored.** `ExpenseRequest.user_id` and `ExpenseWithItemsRequest.user_email` exist in the request models (`models/api_models.py:50,118`), but the handlers always use `auth_required`. That's correct, but the fields are misleading, and MCP schemas must not carry them.

### 1.2 Persistence

- `Expense` (`db/models.py:89`) has `amount Numeric(12,2)`, `currency` (default `USD`), `tax`/`tip`/`discount`, `category_id String(100)` holding the **bare subcategory name**, `fingerprint`, and a nullable `group_id`.
- `ExpenseItem` (`db/models.py:127`) has `expense_id` (CASCADE), `line_no`, `item_name`, `quantity`, `unit_price`, `line_total`, `tax`, `discount` and `category_id`. **Every personal expense gets a synthesized 1-item "proxy" line** (`expense_service.py:24-80`).
- **Money:** `core/money.py` has `MoneyAmount` / `NonNegativeMoney` (Decimal, 2 dp, ≤ 1,000,000). Responses still serialize amounts as `float` (`ExpenseRow.cost: float`).
- **Text:** `core/text_sanitize.py` NFKC-normalizes text, strips control and bidi characters and tags, and enforces length limits (description 200, name 100, notes 500).

### 1.3 Existing security controls worth reusing

| Control | Location | Reuse for MCP? |
|---|---|---|
| Server-side token revocation (`token_valid_after`) | `auth/security.py:138` | Same pattern for per-connection revocation (DB check per request). |
| Refresh-token family rotation and reuse detection | `auth/service.py:303-388` | Same algorithm for MCP refresh tokens (separate table). |
| Atomic conditional upsert counters in Postgres | `services/ai_quota_service.py` (`AiUsageDaily`) | Template for a shared, cross-instance MCP rate limiter. |
| Decimal money types | `core/money.py` | Directly. |
| Text sanitization types | `core/text_sanitize.py` | Directly. |
| 422 handler that drops echoed input | `main.py:43` | Same idea for MCP validation errors. |
| `AI_ENABLED` style kill switch | `core/config.py` | `MCP_ENABLED`, `MCP_WRITES_ENABLED`. |
| Upload MIME sniffing and size caps | `core/upload_safety.py`, `routes.py:788` | Not needed in v1 (no attachments over MCP). |

---

## 2. Current feature inventory (REST)

All endpoints sit under `/api/v1` and require `auth_required` unless noted. These are the endpoints relevant to MCP; groups, cards, tags and devices are listed only where they matter.

| Area | Endpoint | Handler | Service reused | Rate limit |
|---|---|---|---|---|
| Categorize | `POST /expenses/categorize` | `routes.py:243` `categorize_expense` | `CategorizationService.suggest_local` → LLM via `AiQuotaService` | 60/min/IP |
| Create | `POST /expenses` | `routes.py:288` `create_expense` | `ExpenseService.add_expense` (+ route-level side effects, §5) | none |
| List | `GET /expenses?limit&offset&tag_ids` | `routes.py:393` `list_expenses` | `ExpenseService.get_expenses_for_user` (**loads all rows**) | none |
| Update | `PUT /expenses/{row_id}` | `routes.py:419` | `ExpenseService.update_expense` (full replace) | none |
| Delete | `DELETE /expenses/{row_id}` | `routes.py:493` | `ExpenseService.delete_expense` (hard delete) | none |
| Itemized create | `POST /expenses/with_items?force` | `routes.py:946` | `PostgresRepo.append_expense` + `append_items` | none |
| Items read/replace | `GET/PUT /expenses/{id}/items` | `routes.py:1035`, `:1057` | `PostgresRepo` | none |
| Receipt parse (image) | `POST /ingest/receipt/parse` | `routes.py:788` | `ReceiptService` (OCR, LLM fallback, metered) | 3/min/IP |
| Receipt parse (text) | `POST /ingest/receipt/parse_ocr` | `routes.py:908` | `ReceiptService.parse_ocr_rows` (**no LLM**) | 10/min/IP |
| Analysis | `GET /analysis?year&month&start_date&end_date&scope&group_id&tag_ids` | `routes.py:645` | `AnalysisService.analyze` | none |
| Change insights | `GET /analytics/changes` | `routes.py:526` | `InsightAnalyticsService.calculate_change_insights` (like-for-like periods) | none |
| Merchants / items | `GET /analytics/merchants[/{name}]`, `/analytics/items[/{name}]` | `routes.py:547-640` | `AnalyticsService`, `InsightAnalyticsService` | none |
| Budgets | `GET /budgets`, `GET /budgets/{id}/breakdown` | `routes.py:1484`, `:1547` | `BudgetService.list_budgets`, `get_breakdown` | none |
| Recurring | `GET /recurring/templates`, `GET /recurring/due` | `routes.py:1120`, `:1157` | `RecurringService.list_templates`, `compute_due` | none |
| Export | `GET /expenses/export.csv`, `GET /account/export` | `routes.py:374`, `:355` | `PersonalExportService`, `AccountExportService` | –, 5/hour |
| AI chat | `POST /analysis/chat` | `routes.py:690` | `chat_service.call_chat_model` (LangGraph) | 5/min/IP |
| Auth | `/auth/login`, `/google`, `/refresh`, `/logout`, `/logout-all`, `/sessions`, `/profile`… | `auth/routers.py` | `AuthService` | 5/min login |

**There is already an in-house AI agent with tools.** `call_chat_model` (`services/chat_service.py:790`) exposes LangGraph tools: `get_expense_summary`, `search_expenses`, `get_item_insights`, `get_merchant_insights`, `create_expense`, and (behind flags) group, card and tag tools. It is **create-only by design**, with no update or delete (AGENTS.md key decision). The LLM-free helpers behind those tools are directly reusable:

- `_search_expenses_for_agent` (`chat_service.py:360`): text search over description and merchant, with line-item fallback, capped at 25.
- `_create_personal_expense_from_agent` (`chat_service.py:442`): wraps `ExpenseService.add_expense`.
- `_resolve_agent_category` (`chat_service.py:248`): validates the category against the taxonomy, with a rule fallback.

MCP is effectively "the same tool idea, exposed to *external* agents". The difference is that the agent is no longer ours, so every decision the in-house agent makes implicitly (category fallback, today's date, merchant capture) becomes an explicit, validated input.

---

## 3. Category workflow analysis

### 3.1 Findings

| Question | Answer |
|---|---|
| Global or per-user? | **Global and hard-coded.** `CATEGORY_GROUPS` (`services/categorization_service.py:15`) has 7 main categories and about 45 subcategories. Per-user influence is limited to *suggestion memory* (`category_memory` table), not the taxonomy itself. |
| How represented? | Python dict `{main: [sub, ...]}`. **The expense stores only the bare subcategory string** in `expenses.category_id`. |
| Stable identifiers? | **None.** The "ID" *is* the display name. `"Other"` appears under 6 mains (and twice under Utilities), `"Services"` under Home and Other, `"Electronics"` under Home and Other. This ambiguity is already acknowledged in ROADMAP ("Budgets on full category path"). |
| Relationship validation? | `VALID_CATEGORY_IDS` (`categorization_service.py:71`) is a flat set of subcategory strings, used only by custom cards. The receipt parser validates the `(main, sub)` pair (`receipt_service.py:30-48`), and so does the chat agent (`chat_service.py:248`). |
| Descriptions available? | No. |
| Does `POST /expenses` accept an explicit category? | **Yes.** `ExpenseRequest.category` is required and the client always supplies it; the categorizer is a separate, optional call. **The REST endpoint does not validate it against the taxonomy** (`CategoryStr` only sanitizes and length-limits it). |
| Copies of the taxonomy | Four, all maintained by hand: backend `CATEGORY_GROUPS`, web `AddExpenseForm.tsx`, mobile `src/constants/categories.ts`, and the chat prompt `_CATEGORY_GUIDE` (`chat_service.py:237`). |
| Can the categorization service be bypassed safely? | **Yes.** It is a pure suggestion step. The save path never calls it. Agent-side selection needs no backend change beyond strict validation. |

### 3.2 MCP design consequence

- Introduce **stable, derived category IDs** in a new read-only module that is built from `CATEGORY_GROUPS`. Storage doesn't change: the ID is `"<main-slug>.<sub-slug>"`, e.g. `food_drink.groceries`, `utilities.other`.
- `list_categories` returns the full tree with IDs. `create_expense` accepts **only** a `category_id` from that tree, resolves it to `(main, sub)`, and stores `sub` in `expenses.category_id` exactly as the web form does today. Existing data, analytics, budgets and Card Coach are unaffected.
- The `"Other"` ambiguity is **not** made worse: MCP stores exactly what the web form would store for the same choice. Fixing it is the existing ROADMAP item.
- The backend LLM categorizer is **not** called for MCP writes (zero AI quota, zero provider calls).

---

## 4. Receipt workflow analysis

### 4.1 Current flow (web and mobile)

1. **Parse without persisting.** `POST /ingest/receipt/parse` uploads an image (≤ 12 MB, MIME-sniffed). The `hybrid` engine runs RapidOCR plus the rule parser `receipt_text_parser.py`, and calls Gemini only below 0.75 confidence (quota-metered). Mobile runs OCR on-device and posts text lines to `/parse_ocr`, which never calls an LLM.
2. `ReceiptService._finalize` (`receipt_service.py:311`) validates categories against `CATEGORY_GROUPS` and computes `fingerprint = sha256(merchant_raw + purchased_at[:13] + amount + first-3 item names)` (`:343`).
3. **The user reviews the result in the UI**, then the client posts `POST /expenses/with_items` with `{header: {...}, items: [...], fingerprint}`.
4. `create_expense_with_items` (`routes.py:946`) checks that `purchased_at` and `amount` are present, validates `amount` with `validate_money_amount`, and **reconciles** `Σ line_total + tax + tip − discount == amount ± $0.02`. It also checks for a duplicate fingerprint (409 unless `force=true`), then calls `repo.append_expense` (**commit #1**), then `repo.append_items` (**commit #2**, with a compensating delete on exception). Finally it runs insight aggregation, tags and category memory.

### 4.2 Answers to the review questions

| Question | Finding |
|---|---|
| Extraction schema | `ReceiptParseResponse` returns `header: Dict[str, Any]`, `items: List[Dict]`, `warnings`, `fingerprint`, `source`, and `confidence`. The header keys in practice are `merchant_name`, `merchant_name_raw`, `purchased_at`, `amount`, `tax`, `tip`, `discount`, `currency`, `main_category_name`, `category_name`, `description`, and `payment_method`. |
| Header and line-item models | `ExpenseWithItemsRequest.header` is an **untyped `Dict[str, Any]`**. `ExpenseItem` (`api_models.py:104`) is typed: Decimal money, `line_no` int, `quantity: float`, `category_id: str` (unvalidated). |
| Linking | `expense_items.expense_id` FK with ON DELETE CASCADE. `expenses.split_type = "itemized"`. |
| Totals and discounts | Header-level `tax`, `tip`, and `discount`. Each item has its own `tax` and `discount` (stored, but not part of reconciliation). `line_total` is treated as already net of item discount. |
| Saving pre-extracted data? | **Yes.** `/expenses/with_items` already accepts structured data and never calls an LLM. This is the right core to reuse. |
| Receipt image storage? | **None.** Images are never persisted, and there is no object storage bucket. |
| Partial writes possible? | **Yes.** Two commits. A process kill between commit #1 and the compensating delete leaves a header row with an amount and no items, which counts in analytics with no line items. |
| Failure recovery | Only the in-process compensating delete. No operation log. |
| Duplicate detection | A client-supplied fingerprint, no unique constraint (racy), and `force=true` bypasses the check. |

### 4.3 MCP design consequence

- `create_itemized_expense` reuses the **same reconciliation rule, repository and post-save side effects**, but with a **typed** header model, a **server-computed** fingerprint, **one transaction**, and an idempotency record committed in that same transaction.
- No attachments over MCP in v1. The agent parses the image itself. For agents without vision, a deterministic `parse_receipt_text` tool can wrap `ReceiptService.parse_ocr_rows` (no LLM, no upload, no SSRF surface). The image-to-LLM backend parser stays web and mobile only.
- Inconsistent totals are **never auto-corrected**. The tool returns `totals_mismatch` with the computed figures. The agent may resubmit with `accept_unreconciled=true`, which **forces user approval** (security design §8).

---

## 5. Business logic embedded in route handlers (refactor candidates)

MCP must call the same code as REST. Today several important side effects live **in the route function**, not the service, so calling `ExpenseService.add_expense` alone (as the chat tool does) silently skips them.

| Route | Logic in the handler that a second entry point needs | Chat tool skips it today? |
|---|---|---|
| `create_expense` `routes.py:288-352` | (a) held-card check, (b) `analysis_service.invalidate_cache()`, (c) insight aggregation background task, (d) tag apply, (e) `CategoryMemoryService.record`, (f) response shaping | Yes: no cache invalidation, no aggregation, no category memory |
| `create_expense_with_items` `routes.py:946-1018` | header validation, reconciliation, fingerprint dedup, two-step write and compensation, aggregation, tags, category memory | n/a |
| `update_expense` `routes.py:419-490` | cache invalidation, aggregation diff, tag replace semantics, category memory | n/a |
| `list_expenses` `routes.py:393-416` | sorting, tag filter, offset paging **in Python over all rows** | n/a |

**Minimal refactor (no behaviour change for REST):**

1. Add `services/expense_write_service.py` with `ExpenseWriteService.create_simple(...)` and `create_itemized(...)`. They contain the logic from (a)–(e) above and take `commit: bool = True`, so a caller can include the write in a larger transaction. The two REST handlers become thin wrappers. Background aggregation stays a callback parameter so REST keeps using `BackgroundTasks`.
2. Add `commit: bool = True` to `ExpenseService.add_expense`, `PostgresRepo.append_expense` and `append_items`. The REST itemized path then also gets the single-transaction fix (closes gap G3 for first-party clients too).
3. Add `ExpenseService.query_expenses(user, start, end, category_sub, merchant, text, min/max, sort, limit, cursor)`, a DB-side filtered and paginated query. MCP uses it from day one. The REST `list_expenses` can migrate later (an optional performance win; gap G5).
4. Add a `category_catalog` module (stable IDs, resolve, validate). The chat tool's `_resolve_agent_category` and the receipt validators can use it later.

Everything else (analysis, budgets, recurring, change insights) is already cleanly in services and can be called directly.

---

## 6. Existing security gaps found during the review

Severity uses `.ai-sdlc` (P0–P3). "Confirmed" means the code was read and the behaviour is certain; "Suspected" means it needs a test to prove. Each row is rated **for the existing product**; the MCP impact column says why it matters more once agents arrive.

| ID | Gap | Evidence | Sev (today) | MCP impact |
|---|---|---|---|---|
| G1 | `POST /expenses` accepts any category string | `ExpenseRequest.category: CategoryStr` (`api_models.py:53`), no taxonomy check | P3 Confirmed | Must not be reused unvalidated: an agent would invent categories. |
| G2 | `/expenses/with_items` header is an untyped dict: `description`/`notes`/`merchant_name` **bypass `text_sanitize`**, `currency` is unvalidated, `tax`/`tip`/`discount` go through `to_decimal` with **no bounds (negatives accepted)**, item `category_id` is unvalidated, and there's **no item-count cap** | `api_models.py:118`, `routes.py:960-975`, `postgres_repo.py:66` | P2 Confirmed | A negative tip can make an arbitrary item sum "reconcile". Unbounded items. Needs a typed model for MCP (and ideally REST). |
| G3 | Itemized create is two commits plus a compensating delete, so a crash leaves an orphan header | `postgres_repo.py:107,161`, `routes.py:985-990` | P2 Confirmed | Agents retry on timeout, so partial state is more likely. |
| G4 | Receipt dedup uses a client-supplied fingerprint, has no unique constraint, is racy, and can be bypassed with `force=true` | `routes.py:982-984`, `postgres_repo.py:16` | P3 Confirmed | MCP needs a server-computed fingerprint plus idempotency keys. |
| G5 | `GET /expenses` loads every personal expense, then slices in Python, with no date filter | `routes.py:403-416`, `expense_service.py:119` | P3 (perf) Confirmed | A read-exfiltration amplifier. MCP must use a DB-paginated query with range caps. |
| G6 | Rate limits are per IP and in-memory per instance. Behind DNS-only `trackspense-api`, `CF-Connecting-IP` is client-settable | `core/limiter.py`, ROADMAP "Infra" | P2 Confirmed (known) | **Agent traffic arrives from provider egress IPs shared by many users**, so per-IP limits would throttle innocent users together and protect nobody. MCP limits must key on user and connection, in shared storage. |
| G7 | `AnalysisService` cache is process-local and a write clears it only on the instance that took the write; other instances may serve data up to 60 s stale | `analysis_service.py:38-48` | P3 Confirmed | Read-after-write for agents ("add X… now what's my total?") can be wrong when the instances differ. MCP reads use `use_cache=False`. |
| G8 | No audit trail for personal expense create, update or delete (only `group_activity` for groups) | `db/models.py` table list | P2 Confirmed | Can't answer "which agent changed this?". Needs an audit table plus `expenses.created_by_connection_id`. |
| G9 | Cloud Run `*.run.app` is reachable directly (`--allow-unauthenticated`), so the edge can be bypassed | `cloudbuild.yaml:97`, ROADMAP | P2 Confirmed (known) | MCP must not trust edge headers. Validate the token `aud` against the configured canonical URL, never the `Host` header. |
| G10 | The backend runtime service account holds **`roles/editor`** at project level | `docs/INFRASTRUCTURE.md` §5 | P2 Confirmed (known) | Any SSRF that reaches the Cloud Run metadata server (`169.254.169.254`) yields a project-editor token. **OAuth Client ID Metadata Document fetching is an SSRF vector**, so it must be hardened (security design §3.4). |
| G11 | First-party JWTs have no `iss`/`aud` | `auth/security.py:64` | P3 Confirmed | MCP tokens must be distinguishable and must never be accepted by `auth_required` (and vice versa). |
| G12 | `ExpenseService.update_expense` is full-replace, including `card_id`, so a partial-update caller wipes card attribution. Updating `amount` on an itemized expense desynchronizes the items | `expense_service.py:157-246` | P3 Confirmed | Relevant to `update_expense` (P2): it needs merge semantics and must refuse amount changes on itemized rows. |
| G13 | The category taxonomy is duplicated by hand in four places | §3 | P3 Confirmed | `list_categories` becomes the server source of truth. Clients could adopt it later. |
| G14 | AI-processing consent is per device and client-side for chat (ROADMAP) | AGENTS.md "AI consent" | P3 Confirmed (known) | Connecting an external agent *is* sending data to an AI provider, so the OAuth consent screen must carry that disclosure. |

No cross-tenant (IDOR) defect was found in the endpoints read: every personal query is scoped by `user_email` and `group_id IS NULL`, and group queries go through membership joins. ROADMAP already notes that **nothing proves this automatically**. The MCP test plan adds cross-user negative tests for every tool (implementation plan, Phase 1).

---

## 7. Google Sheets data-integrity review → reframed for Postgres

The brief's §9 asked whether Sheets is suitable for agent writes. Sheets is not in use. Here is the same checklist evaluated against what the system actually runs on:

| Concern | Postgres today | Needed for MCP |
|---|---|---|
| Concurrent writes | MVCC. Each request has its own session. | Fine. |
| Duplicate creation | No idempotency, and the fingerprint check is racy (G4) | `mcp_operations` table with a **unique** `(connection_id, tool, idempotency_key)` index. The claim insert serializes concurrent duplicates. |
| Partial receipt writes | Two commits (G3) | One transaction: operation row, expense, items, audit event. |
| Header and line consistency | Reconciliation check exists | Same rule, plus typed and bounded tax, tip and discount. |
| Atomicity | Full ACID available | Use it. That's the whole fix. |
| API quotas | n/a (no Sheets API). Supabase connection limits are the constraint | Stateless MCP plus the existing SQLAlchemy pool. Rate-limit counters are one upsert per call. |
| Recovery after failure | none | Operation state survives restarts. A retry with the same key returns the committed result, or reports `in_progress` / `failed`. |
| Cross-user isolation | Query scoping | Same, plus the connection → user binding resolved from the token. |
| Audit | none for personal (G8) | `mcp_audit_events`. |

**Recommendation:** no database migration and no new datastore. Add five small tables to the existing `trackspense` schema (security design §12) through one Alembic revision with a random hex ID.

---

## 8. MCP integration opportunities

| User intent (from the brief) | Tool(s) | Backed by |
|---|---|---|
| "Add $45 for groceries at Costco" | `list_categories` → `create_expense` | `ExpenseWriteService.create_simple` → `ExpenseService.add_expense` |
| "I spent $25 on lunch yesterday" | same (the agent resolves "yesterday" into an ISO date) | same |
| "How much did I spend on restaurants this month?" | `get_category_breakdown` | `AnalysisService.analyze` |
| "Compare my grocery spending with last month" | `get_category_breakdown(compare_to_previous=true)` | `AnalysisService.analyze` ×2 with like-for-like periods (`InsightAnalyticsService._resolve_comparison_periods`) |
| "Here is my Walmart receipt. Track all the items." | `list_categories` → `create_itemized_expense` (or `parse_receipt_text` for agents without vision) | `ExpenseWriteService.create_itemized` → `PostgresRepo` |
| "Show my biggest expenses this year" | `list_expenses(sort="amount_desc")` | `ExpenseService.query_expenses` (new) |
| "Am I over budget?" | `get_budget_status` | `BudgetService.list_budgets` |
| "What subscriptions do I have?" | `get_recurring_expenses` | `RecurringService.list_templates` / `compute_due` |

---

## 9. Proposed architecture (summary)

Full rationale is in [mcp-security-design.md](mcp-security-design.md). This is the shape:

```
ChatGPT / Claude / OpenClaw / other MCP client
     │  OAuth 2.1 + PKCE (CIMD / pre-registered; DCR only if a target client needs it)
     │  Bearer <MCP access token, aud=https://trackspense-api.cerebroos.com/mcp>
     ▼
trackspense-api.cerebroos.com   (same Cloud Run service, same image)
 ├── /.well-known/oauth-protected-resource/mcp     RFC 9728
 ├── /.well-known/oauth-authorization-server        RFC 8414
 ├── /oauth/authorize  /oauth/token  /oauth/revoke  (in-house AS, Authlib-backed)
 ├── /mcp     Streamable HTTP, stateless, JSON responses   ◄── mcp/ package
 │     └── MCP gateway: verify token → load connection → policy → rate limit
 │           → explicit tool registry → handler → shared services → audit
 ├── /api/v1/ai-connections/*  first-party only (cookie or app Bearer): list, revoke, policy, approvals, activity
 └── /api/v1/*   unchanged REST
SPA (expense.cerebroos.com): /connect/authorize (consent), /ai/approve/:id, Settings → AI Connections
```

**Option A (MCP inside the existing FastAPI app) is recommended** for Phases 1–4. The code lives in its own `mcp/` package with no import from `api/`, so it can later be split into a separate Cloud Run service from the same image (Option B′) without rewriting it. The comparison is in [mcp-security-design.md §2](mcp-security-design.md#2-deployment-architecture-option-a-vs-b).
