# TrackSpense — MCP Integration Review (Phase 0)

> **Status:** Historical Phase 0 review with approved revisions (2026-11-21). A local, default-off v1 implementation now exists; see [implementation evidence and rollout](mcp-local-implementation.md). Real-client and production acceptance remain open.
> **Date:** 2026-11-21 · Original Phase 0 investigation followed by code-backed audit and user-approved revisions.
> **Companion docs:** [mcp-tool-specification.md](mcp-tool-specification.md) · [mcp-security-design.md](mcp-security-design.md) · [mcp-implementation-plan.md](mcp-implementation-plan.md)
>
> Repository observations below describe the pre-MCP implementation. The implementation/evidence document distinguishes completed local controls from remaining launch gates. Infrastructure descriptions reflect repository documentation, not a live cloud audit. Paths are repo-relative; `routes.py` means `varavu_selavu_app/varavu_selavu_service/api/routes.py` unless stated.

---

## 0. Corrections to the brief's assumptions

The brief listed several assumptions. Three of them are wrong, and they change the design materially.

| Brief assumed | Actually in the repo | Consequence for the MCP design |
|---|---|---|
| **Google Sheets** is the database | **Supabase Postgres** via SQLAlchemy 2 + Alembic, schema `trackspense` (`docs/ARCHITECTURE.md`, `db/session.py`, `db/models.py`, 27 Alembic revisions). Nothing in the backend uses Google Sheets; the only "Sheets" string is a stale comment at `routes.py:194`. | Transactions, unique constraints and atomic upserts are available. Expense, committed operation, success audit and create counters share one save transaction; verification and approval are earlier separate transactions. No second datastore or datastore migration is needed; new tables/columns still require Alembic schema migrations. |
| The API is at `https://expense.cerebroos.com` | `expense.cerebroos.com` is the **React SPA** (nginx, Cloudflare-proxied CNAME). The API is **`trackspense-api.cerebroos.com`**, a Cloud Run domain mapping that is **DNS-only (not proxied by Cloudflare)** (`docs/INFRASTRUCTURE.md` §4). | `/mcp` belongs on `trackspense-api.cerebroos.com`. Cloudflare WAF and rate limiting do **not** sit in front of the API today. |
| "JWT-based authentication" is enough to build on | It's HS256 first-party JWTs with **no `iss`/`aud`**, cookie or Bearer, with server-side revocation via `users.token_valid_after` (`auth/security.py:64-170`). | That works for first-party clients but **can't** be handed to third-party agents. MCP needs its own audience-bound, scoped, per-connection tokens (see security design §3). |

Repository-documented stack facts (verify deployed versions/capacity before launch): FastAPI 0.141, Pydantic v2, Python ≥3.10, Cloud Run `us-central1` with min 1 and max 20 instances at 1 vCPU / 512 Mi each, secrets in GCP Secret Manager, no cron jobs (everything is request-triggered).

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
- `ExpenseItem` (`db/models.py:127`) has `expense_id` (CASCADE), `line_no`, `item_name`, `quantity`, `unit_price`, `line_total`, `tax`, `discount` and `category_id`. **Simple personal expenses get a synthesized 1-item "proxy" line** (`expense_service.py:24-80`); itemized receipts have actual lines, even when there is only one.
- **Money:** `core/money.py` has `MoneyAmount` / `NonNegativeMoney` (Decimal, 2 dp, ≤ 1,000,000). Responses still serialize amounts as `float` (`ExpenseRow.cost: float`).
- **Text:** `core/text_sanitize.py` NFKC-normalizes text, strips control and bidi characters and tags, and enforces length limits (description 200, name 100, notes 500).

### 1.3 Existing security controls worth reusing

| Control | Location | Reuse for MCP? |
|---|---|---|
| Server-side token revocation (`token_valid_after`) | `auth/security.py:138` | Same pattern for per-connection revocation (DB check per request). |
| Refresh-token family rotation and reuse detection | `auth/service.py:303-388` | Reuse the family/revocation concepts, not the existing branching grace implementation. MCP needs atomic opaque-token rotation and bounded family lifetime (security §3.4). |
| Atomic conditional upsert counters in Postgres | `services/ai_quota_service.py` (`AiUsageDaily`) | Template for a shared, cross-instance MCP rate limiter. |
| Decimal money types | `core/money.py` | Reuse bounds/arithmetic with explicit string parsing for strict SDK input. |
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

- Create a backend catalog with pinned stable IDs initially derived from main/subcategory names, e.g. `food_drink.groceries`. Deduplicate Utilities “Other”; label renames must preserve IDs or use explicit aliases.
- `verify_expense` validates the selected full path; `save_expense` writes the existing bare subcategory. No backend LLM categorizer is called.
- **Do not claim full-path round-trip fidelity.** Ambiguous names (Other, Services, Electronics) return null IDs with an ambiguity flag on every expense read, including immediately after save. Preview warns that current storage cannot preserve the chosen main category.
- v1 filters accept globally unique subcategory names, and main categories only if all their subcategories are unambiguous. Reject unsupported filters instead of silently counting other categories or excluding unknown legacy rows. Full-path persistence is a separate roadmap migration.
- Personal-only summaries use Decimal aggregate-only methods and currency-separated totals. Existing `calculate_merchant_metrics` includes group shares, so it requires a personal path before reuse; simply minimizing its response is insufficient.

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

- Receipt additions use the itemized variant of `verify_expense`, the same first-party browser approval, and `save_expense(operation_id)`. No direct receipt-create MCP tool exists.
- Verification validates structured input, reconciles totals, detects probable duplicates and stores an immutable draft. It writes no expense. Approval records a user decision but also writes no expense. Save atomically writes expense/items, operation result, audit and committed-create counters.
- Historical purchase dates are supported without the former three-year cutoff. Duplicate checks consider existing REST/chat/recurring/import expenses and are repeated under a shared user lock at save. Newly discovered duplicates require renewed approval.
- No attachments or backend image/LLM call in v1. Optional `parse_receipt_text` wraps deterministic `ReceiptService.parse_ocr_rows`, returning a partial draft with missing-field warnings.
- Mismatched totals are never automatically corrected. `accept_unreconciled` permits preparing a warning-bearing draft, not saving without approval. Browser approval explicitly acknowledges the discrepancy.
- Current `ExpenseItem.quantity` is Numeric(10,2); three-decimal receipt quantities require a reviewed Numeric(12,3) migration before enabling itemized verification. Real one-item receipts must not be hidden as proxies.

---

## 5. Shared-service extraction and transaction audit

MCP must reuse business rules through services, not import/call REST routes. The original plan identified route-level effects but did not account for nested helper commits.

| Concern | Existing code | Required change |
|---|---|---|
| Simple creation | `routes.py:288`: held-card check, expense/proxy creation, cache invalidation, aggregation, tags, category memory | Transaction-owning `ExpenseWriteService`; preserve REST contract; MCP saves only approved stored payload |
| Itemized creation | `routes.py:946`, repository header/items commit separately | One financial transaction, no compensating-delete substitute |
| Category memory | `category_memory_service.py:111` commits; `:114` rolls back the shared session | Flush-only/savepoint or explicit post-commit independent session; no hidden financial commit/rollback |
| Tag writes | `tag_service.py` methods contain commits | Audit every participating helper; preserve tag behavior without inner commits |
| Personal write entry points | REST, in-house chat, recurring, imports and edit/delete paths | Inventory all writers; acquire the same short per-user lock for duplicate-relevant changes |
| List/detail | List loads all rows; items may be unbounded | DB keyset query, scoped indexes, bounded legacy items and honest provenance |
| Summary | `analysis_service.py:138` loads all detail rows even if the caller drops them | Aggregate-only shared SQL with Decimal and no-cache MCP reads |
| Merchant summary | `insight_analytics_service.py:170` unions group shares | Explicit personal query path, consistent currency/scope across all summary fields |

The outer save transaction owns expense/items, committed-operation state, success audit and create quota. A pre-existing operation row supplies the idempotency lock. There is no durable processing lease or arbitrary two-minute recovery rule. Post-commit callbacks cannot reverse success; use explicit session lifetimes and authoritative aggregate reads.

The [security design](mcp-security-design.md) defines per-user/operation locks and revocation ordering. The [plan](mcp-implementation-plan.md) requires Postgres race/fault tests, including different keys and cross-channel duplicates, not only same-key replays. Existing REST response shapes stay stable; transaction safety improves. New strict MCP inputs must not silently narrow first-party accepted inputs.

---

## 6. Existing security gaps found during the review

Severity uses `.ai-sdlc` (P0–P3). "Confirmed" means the code was read and the behaviour is certain; "Suspected" means it needs a test to prove. Each G-row retains the original assessment **for the existing product**; this is not a live penetration test or an implemented MCP finding. The later A1–A16 design audit is tracked in the implementation plan §4.

| ID | Gap | Evidence | Sev (today) | MCP impact |
|---|---|---|---|---|
| G1 | `POST /expenses` accepts any category string | `ExpenseRequest.category: CategoryStr` (`api_models.py:53`), no taxonomy check | P3 Confirmed | Must not be reused unvalidated: an agent would invent categories. |
| G2 | `/expenses/with_items` header is an untyped dict: `description`/`notes`/`merchant_name` **bypass `text_sanitize`**, `currency` is unvalidated, `tax`/`tip`/`discount` go through `to_decimal` with **no bounds (negatives accepted)**, item `category_id` is unvalidated, and there's **no item-count cap** | `api_models.py:118`, `routes.py:960-975`, `postgres_repo.py:66` | P2 Confirmed | A negative tip can make an arbitrary item sum "reconcile". Unbounded items. Needs a typed model for MCP (and ideally REST). |
| G3 | Itemized create is two commits plus a compensating delete, so a crash leaves an orphan header | `postgres_repo.py:107,161`, `routes.py:985-990` | P2 Confirmed | Agents retry on timeout, so partial state is more likely. |
| G4 | Receipt dedup uses a client-supplied fingerprint, has no unique constraint, is racy, and can be bypassed with `force=true` | `routes.py:982-984`, `postgres_repo.py:16` | P3 Confirmed | MCP needs server-side duplicate matching serialized with all personal writes, plus operation idempotency. A fingerprint lookup alone is still racy. |
| G5 | `GET /expenses` loads every personal expense, then slices in Python, with no date filter | `routes.py:403-416`, `expense_service.py:119` | P3 (perf) Confirmed | MCP needs DB pagination/range caps and shared disclosure budgets; authorized reads can still extract allowed data. |
| G6 | Rate limits are per IP and in-memory per instance. Behind DNS-only `trackspense-api`, `CF-Connecting-IP` is client-settable | `core/limiter.py`, ROADMAP "Infra" | P2 Confirmed (known) | **Agent traffic can share provider egress IPs**, so per-IP limits alone are unsuitable for authenticated tool quotas. MCP limits must key on user and connection, in shared storage. |
| G7 | `AnalysisService` cache is process-local and a write clears it only on the instance that took the write; other instances may serve data up to 60 s stale | `analysis_service.py:38-48` | P3 Confirmed | Read-after-write for agents ("add X… now what's my total?") can be wrong when the instances differ. MCP reads use `use_cache=False`. |
| G8 | No audit trail for personal expense create, update or delete (only `group_activity` for groups) | `db/models.py` table list | P2 Confirmed | Can't answer "which agent changed this?". Needs an audit table plus `expenses.created_by_connection_id`. |
| G9 | Cloud Run `*.run.app` is reachable directly (`--allow-unauthenticated`), so the edge can be bypassed | `cloudbuild.yaml:97`, ROADMAP | P2 Confirmed (known) | MCP must not trust edge headers. Validate the token `aud` against the configured canonical URL, never the `Host` header. |
| G10 | The backend runtime service account holds **`roles/editor`** at project level | `docs/INFRASTRUCTURE.md` §5 | P2 Confirmed (known) | A metadata SSRF capable of supplying the required headers could expose runtime credentials. CIMD fetch hardening and verified least-privilege runtime IAM are launch gates (security design §3.2). |
| G11 | First-party JWTs have no `iss`/`aud` | `auth/security.py:64` | P3 Confirmed | MCP tokens must be distinguishable and must never be accepted by `auth_required` (and vice versa). |
| G12 | `ExpenseService.update_expense` is full-replace, including `card_id`, so a partial-update caller wipes card attribution. Updating `amount` on an itemized expense desynchronizes the items | `expense_service.py:157-246` | P3 Confirmed | No update tool is in the accepted v1 scope. Any future design needs merge/concurrency semantics and item-total integrity review. |
| G13 | The category taxonomy is duplicated by hand in four places | §3 | P3 Confirmed | `list_categories` becomes the server source of truth. Clients could adopt it later. |
| G14 | AI-processing consent is per device and client-side for chat (ROADMAP) | AGENTS.md "AI consent" | P3 Confirmed (known) | Connecting an external agent *is* sending data to an AI provider, so the OAuth consent screen must carry that disclosure. |

No cross-tenant (IDOR) defect was found in the endpoints read: every personal query is scoped by `user_email` and `group_id IS NULL`, and group queries go through membership joins. ROADMAP already notes that **nothing proves this automatically**. The MCP plan requires cross-user negatives for every registered tool, plus current-grant and first-party approval tests; these are not yet implemented.

---

## 7. Data integrity: Postgres remains the datastore

The brief's Google Sheets assumption does not apply. Postgres already supplies the required transactions, unique keys and row locks. There is no datastore replacement, but there **are schema migrations**: ten new OAuth/MCP tables, nullable expense provenance/fingerprint and session-authentication fields, followed by a separate item-quantity migration. See the security design for the authoritative schema inventory.

| Requirement | Accepted mechanism |
|---|---|
| Validate before adding | Verify stores an immutable draft and exact preview, no financial side effects |
| Approval on every addition | First-party TrackSpense browser POST records payload/revision-bound approval; agent cannot grant it |
| Add only approved data | Save accepts operation ID only and commits the stored draft after current-policy recheck |
| Same-intent retries | Unique verification key plus operation-row serialization; tombstone survives full-payload pruning |
| Different-key duplicates | Date-independent content matching + ±1-day window, legacy fallback/backfill, shared user lock and renewed approval for new matches |
| Partial writes | Expense/items/operation/audit/create counters in one transaction; participating helpers cannot commit independently |
| Crash/timeout | Before commit: no financial write. After commit: status/replay returns the committed identity. No stale-worker lease |
| Revocation race | Shared execution/revocation lock order; a completed save is not undone, but revocation that wins the gate prevents save |
| Exact quantities/totals | Decimal primitives; Numeric(12,3) quantity migration before itemized rollout |
| Private reads | Personal-only queries, bounded items/records, currency-separated aggregates and honest category ambiguity |

## 8. User journeys

| Intent | Tool flow / requirement |
|---|---|
| “Add $45 for groceries at Costco” | Catalog → verify simple → show preview/link → TrackSpense approval → save → committed result |
| “I spent $25 on lunch yesterday” | Resolve date with user → same approval flow |
| “Here is an old Walmart receipt” | Client extraction or deterministic text parse → verify itemized with historical date → duplicate warnings → browser approval → save with duplicate recheck |
| “Show my biggest expenses this year” | Bounded personal list, amount sort, currency-aware totals |
| “Compare grocery spending with last month” | Personal category breakdown, unique category filter, shared like-for-like period resolver |
| “What happened to the expense I approved?” | Operation status distinguishes approved-but-not-saved, committed, rejected and expired |
| “Sign out everywhere” | First-party action revokes agent grants/tokens and outstanding approvals; reconnect required |

The page opened by the approval link uses the existing TrackSpense login and works on phones. Opening it does not approve. Clicking Approve does not save; the agent must call save afterward. Both agent and page make that distinction explicit. Chat “yes” and host tool confirmation may aid UX but cannot replace the server's first-party approval record. URL elicitation is optional; a normal link is the fallback.

## 9. Accepted architecture and rollout

```text
Claude app first / ChatGPT second
    │ OAuth + scoped MCP Bearer token
    ▼
trackspense-api.cerebroos.com
    ├── OAuth discovery + authorize/token/revoke (Authlib working choice)
    ├── /mcp: registry → current policy → budgets → shared services
    │      ├── bounded personal read tools
    │      ├── verify_expense → pending draft
    │      └── save_expense(operation_id) → approved payload → atomic commit
    └── /api/v1/... first-party consent/management/approval/activity
                    ▲
expense.cerebroos.com: consent + review/approve/reject + connection management
                    │ first-party user session, never MCP credentials
                    └── approval only; save remains a separate agent tool call
```

- Retain Option A (same FastAPI service) with isolated packages. Confirm actual client/SDK/auth interoperability before expanding implementation; do not assume subscription eligibility or DCR necessity.
- Personal-only means **all** reads and writes, including summaries, independent of group flags. Groups are later work with membership/split/notification/approval analysis.
- Every expense requires independent approval; remove the former $500/25-auto-save proposal entirely from implementation scope. Historical dates are allowed.
- Read launch includes basic activity, disconnect/suspend, privacy disclosure and export/deletion. Write launch includes browser approval and attribution/management links on web and mobile. Native approval UI may follow later.
- Sign out everywhere now includes agents. First-party ordinary logout remains separate. Connections are not resurrected on reconnect.
- Global DB controls, safe schema/retention, least-privilege runtime IAM, bounded aggregate queries and explicit Postgres CI are release prerequisites. No claim of zero infrastructure cost or unchanged capacity without measurement.

## 10. Follow-up audit and evidence status

The follow-up audit identified **10 P1 and 6 P2 design gaps**, addressed as requirements in the revised documents: transaction helpers, duplicate races, recovery, approval authorization, OAuth/protocol completeness, summary scope/currency, categories, quantity storage, user rights, PG CI, strict parsing, quotas, query cost, lifecycle/schema, parity/visibility and inconsistent contracts. See [plan §4](mcp-implementation-plan.md#4-audit-disposition-and-traceability) for A1–A16 and phase mapping.

A local Pydantic probe confirmed that strict Decimal validation differs between Python-dictionary and JSON input; explicit SDK-path parsing is required. Code inspection confirmed category-memory commits, merchant group-share union, two-decimal quantity storage, eager detail aggregation, the PG runner's fixed file list and absent PG service in unit CI. No live cloud settings, real-client flows or MCP runtime security tests were verified. No application code changed in this review/revision.

The documents capture accepted direction, not a completed security audit of an implementation. Next work is the Phase 1 compatibility/security prototype; phase exit criteria require actual tests and routed reviews.
