# TrackSpense — MCP Tool Specification

> **Status:** Local v1 tools implemented on 2026-11-21, disabled by default. See [implementation evidence and rollout](mcp-local-implementation.md); Claude/ChatGPT app acceptance is still required.
> **Companions:** [review](mcp-integration-review.md) · [security](mcp-security-design.md) · [plan](mcp-implementation-plan.md)
> **Launch order:** Claude app first, ChatGPT second. Exact app/account compatibility is a Phase 1 gate.

## 1. Contract and boundaries

- Personal expenses only in v1, including summaries. No group input, group shares, group-authored data or group writes, regardless of `GROUPS_ENABLED`.
- **Every expense addition requires first-party TrackSpense approval.** Two tools implement preparation and execution: `verify_expense` → browser approval → `save_expense`. Validation is not approval. Neither tool can grant approval.
- No automatic writes, approval thresholds, daily automatic-save allowances or configurable approval bypass in v1. Chat text saying “yes” or a client confirmation dialog is not the server's approval record.
- No update/delete/export/bulk tools. No attachment upload, URL fetching or backend LLM calls. Receipt extraction happens in the client; optional text parsing is deterministic.
- Tools are explicitly registered in `mcp/registry.py`. Each `ToolSpec` declares schemas, scopes, risk, rate/audit policies, flag and annotations. No reflection over REST routes.
- `tools/list` is deterministic and filtered by current effective scopes and flags. `tools/call` enforces the same controls. Effective scopes are the intersection of token scopes and the current connection grant.

### 1.1 Input/output conventions

Inputs forbid extra fields recursively. No tool accepts user/email/tenant/owner/group/connection identity. Expense UUIDs and operation IDs are resource references, not identity selectors.

Money is a finite decimal **string** with at most two fractional digits, positive for totals and non-negative for tax/tip/discount/line amounts, capped at 1,000,000. JSON numbers are rejected in v1 to avoid floating-point ambiguity. Quantity is a decimal string with at most three fractional digits, `0 < quantity <= 10000`. Explicit before-validators parse strings to `Decimal`; do not rely on `strict=True` accepting strings from SDK-decoded Python dictionaries. Reject booleans, exponent notation and non-finite values. Test the actual SDK entry point.

All monetary calculations and SQL aggregates remain Decimal until decimal-string serialization. Do not reconstruct exact amounts from float analytics results. Percentages have separately specified rounding; money comparisons use exact decimals.

Dates are ISO `YYYY-MM-DD`, stored as noon UTC consistently with existing personal expenses. The client resolves relative dates with the user. Valid historical dates have no rolling three-year cutoff or account-creation cutoff. Dates after UTC today + 1 day are rejected; the allowance handles timezone differences. Query windows are separately capped at 366 inclusive days. Reject conflicting period inputs instead of silently prioritizing them.

Every tool returns structured output plus a concise text rendering of the same outcome. Validate success, pending, terminal and error variants through the pinned SDK; explicitly model structured errors. User-originated text is marked as data in schema descriptions and escaped in UI output, never interpreted as instructions.

Bound the complete serialized tool result (including text duplication) to 256 KiB. Expense-list pages target at most 25 KiB and detail-item pages 128 KiB: byte-aware pagination may return fewer than the requested row limit, with a correct continuation. Bound legacy free-text fields to the corresponding documented display limits with explicit truncation indicators. Never silently omit receipt lines or approval fields; reject an oversized verification preview before storing a draft, or require a smaller submission. First-party approval pages load the complete stored draft.

Annotations: financial reads are `readOnlyHint=true`, `openWorldHint=false`; verify is **not read-only** because it stores a draft; verify/save have `destructiveHint=false`, `idempotentHint=true`, `openWorldHint=false`. Hints do not enforce security.

### 1.2 Errors

Authentication failures are HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="https://trackspense-api.cerebroos.com/.well-known/oauth-protected-resource/mcp"`. Insufficient scope uses HTTP 403 with the protocol's `insufficient_scope` challenge. Unknown tools/malformed protocol messages use protocol errors; domain failures use tool results with `isError=true`.

```json
{"error":{"code":"invalid_category","message":"Unknown category. Call list_categories.","retryable":false,"retry_after_seconds":null,"details":{"field":"category_id"}}}
```

Errors never echo submitted text, SQL, stack traces or provider responses. Validation errors contain locations/reasons; internal errors contain a correlation ID.

| Code | Meaning / action |
|---|---|
| `validation_error`, `invalid_category`, `unsupported_currency`, `date_out_of_range`, `range_too_large` | Correct input; nothing saved |
| `ambiguous_category_filter` | Legacy data cannot support this full-path category filter accurately |
| `not_found` | Malformed, foreign, group-owned or unavailable resource; no ownership disclosure |
| `totals_mismatch` | Reconciliation figures differ; return computed decimal totals |
| `idempotency_key_reused` | Same verification key, different normalized payload |
| `operation_in_progress` | Bounded lock wait expired; inspect status, then retry the same operation |
| `approval_required` | Save attempted before approval |
| `operation_rejected`, `operation_expired` | Terminal draft; cannot revive/save it |
| `rate_limited`, `daily_limit_reached` | Contains retry delay, bucket, limit and subject scope |
| `writes_disabled`, `access_suspended`, `feature_disabled` | Current policy prohibits action |
| `internal_error` | Outcome may be unknown; inspect status before retrying |

A new duplicate discovered at save returns a normal `pending_approval` result. Expired/rejected status queries are normal terminal results.

## 2. Inventory and scopes

| Tool | Phase | Required scope | Purpose |
|---|---|---|---|
| `list_categories` | 2 | `categories:read` | Catalog and filtering limitations |
| `list_expenses` | 2 | `expenses:read` | Bounded personal search |
| `get_expense` | 2 | `expenses:read` | Personal expense and receipt items |
| `get_spending_summary` | 2 | `expenses:read` | Personal aggregates |
| `get_category_breakdown` | 2 | `expenses:read` | Personal categories/comparison |
| `verify_expense` (simple) | 3 | `expenses:create` | Store pending draft; no expense added |
| `save_expense` | 3 | `expenses:create` | Commit independently approved draft |
| `get_operation_status` | 3 | `expenses:create` | Same connection's operation |
| `verify_expense` (itemized variant) | 4 | `expenses:create` | Receipt through the same approval flow |
| `parse_receipt_text` | 4 | `expenses:create` | Deterministic partial draft; no persistence |
| `get_budget_status`, `get_recurring_expenses` | 5, separately scoped | `budgets:read`, `recurring:read` | Personal-only advanced reads |

No `create_expense` or `create_itemized_expense` MCP tool is registered: the former proposed direct-create contracts are replaced by verify/save. Existing in-house chat tool names/behavior are a separate surface.

`categories:read` is required when connecting; `expenses:read` grants read access. `expenses:create` is an explicit opt-in available only when write rollout is ready; consent explains browser approval. Advanced scopes are not advertised/issued until implemented. `expenses:update`, `expenses:delete`, `expenses:export` and `budgets:write` are not issued in v1. Group support and mutations beyond addition require separate review.

Create consent also explains limited duplicate-candidate disclosure. Without `expenses:read`, operation replay may return its retained original-save summary while available and only while the expense remains owned and personal; it cannot expose later edits/notes through a live expense lookup or reconstruct a deleted/converted record. After payload pruning it returns terminal state and expense ID only; broader/current expense detail requires the read scope.

## 3. Verification, approval and save

### 3.1 `verify_expense`

Input is a discriminated union: `kind="simple"` or, from Phase 4, `kind="itemized"`.

| Common field | Rules |
|---|---|
| `idempotency_key` | Required, 16–128 `[A-Za-z0-9_-]`; one per intended immutable draft |
| `date` | Required ISO purchase date; historical dates allowed |
| `currency` | Default `USD`; normalize ASCII case, reject other currencies for writes |
| `category_id` | Required catalog subcategory ID, e.g. `food_drink.groceries` |
| `description` | Simple: required, 1–200 sanitized chars; receipt: defaults to `Purchase at <merchant>` |
| `merchant` | Optional simple / required itemized; sanitized, at most 100 chars |
| `notes` | Optional, sanitized, at most 500 chars |

Simple additionally requires `amount`. Itemized instead requires `total` and 1–200 `items`, with optional `subtotal`, header `tax`, `tip`, `discount` (default zero), `payment_method` (`card|cash|other|unknown`) and `accept_unreconciled` (default false; `true` is refused since TS-FIX-102).

Each item has `name` (1–200 sanitized chars), `quantity` (default `"1"`), optional `unit_price`, required `line_total`, `discount` (default zero), optional `original_price` (must equal `line_total + discount`) and optional catalog category (defaults to header). Assign sequential `line_no`; map catalog IDs to stored subcategory names.

`line_total` is net of item discount and excludes header tax/tip/discount. `subtotal` means the sum of net lines. Do not double-count item discounts as header discount. Compare `quantity × unit_price − item_discount` to `line_total` when unit price exists; differences over $0.02 are visible warnings. Example: 2 × $3.49 − $1.00 = $5.98; with $0.50 header tax, total is $6.48. Negative-return lines are unsupported in v1.

**TS-FIX-102:** a header `discount` is divided across the lines by paid price at verify time (each line's `discount` grows and its `line_total` drops; `original_price` is filled in), so the approval preview shows exactly the lines that will be saved and the stored header discount is `0.00`. Then reconcile `abs(sum(lines) + tax + tip − total) <= 0.02` (no discount term); supplied subtotal must match the line sum within $0.02. A mismatch always returns `totals_mismatch` without a draft; `accept_unreconciled=true` returns `validation_error`. Save re-checks the rule, so an operation verified under the old rule (still carrying a header discount) is refused and must be verified again. Three-decimal quantities require the Phase 4 migration before enablement.

Verify authenticates/authorizes, normalizes/validates, finds possible duplicates, and stores one immutable pending operation plus audit event. It does not create expenses, update category memory or run financial aggregation. Example output:

```json
{
  "operation_id": "op_opaque",
  "status": "pending_approval",
  "approval_revision": 1,
  "replayed": false,
  "preview": {"kind":"simple","date":"2026-11-15","amount":"45.10","currency":"USD","category_id":"food_drink.groceries","description":"Groceries","merchant":"Costco"},
  "warnings": [],
  "possible_duplicates": [],
  "approval_url": "https://expense.cerebroos.com/ai/approve/op_opaque",
  "expires_at": "2026-11-22T18:00:00Z"
}
```

The complete preview includes all submitted/defaulted fields, items and reconciliation figures. Duplicate references contain only owned personal expense IDs/dates/amounts/currencies. Expiry is 24 hours from verification, including approval/save time; replay never extends it. A preview is not a saved expense.

### 3.2 Independent approval (not an MCP tool)

The agent displays the preview and link. TrackSpense loads the stored payload using first-party auth, shows warnings/items, and accepts Approve/Reject via POST with CSRF protection. The page works in a phone browser. A URL GET, client confirmation, chat text or MCP credential cannot approve.

Approval binds the exact payload hash, approval revision and duplicate-review snapshot. **Approve does not save:** the page says “Approved; return to your assistant to finish saving.” The agent then calls save; status remains available if chat pauses. No later automatic execution occurs if the agent never returns. Editing means rejecting the draft and verifying a new draft with a new key.

URL elicitation can open this same page when supported; an ordinary link is the required fallback. Client-provided approval is never treated as a first-party decision.

### 3.3 `save_expense`

Input `{operation_id}` only. No expense fields, approval boolean, payload hash or connection ID. The operation itself is the save idempotency key.

Within the shared execution gate, lock the operation; check ownership, current grant, expiry and approval revision; recheck duplicates and committed-create limits. A previously unreviewed match invalidates approval, increments its revision and returns `pending_approval` with updated warnings and the same URL. Previously acknowledged unchanged duplicates may proceed. No expense is written while reapproval is needed.

On success, expense/items, the operation's committed transition and audit event commit together from the stored payload. Output `{operation_id,status:"committed",replayed:false,expense:ExpenseSummary}`. Report success only after commit. Repeated save returns the same expense identity, never another insertion.

### 3.4 Idempotency and terminal results

- Verification uniqueness is `(connection_id,"verify_expense",idempotency_key)`. Hash canonical normalized input including `kind`, excluding the key; persist canonicalization version.
- Same key/different hash fails. Same key/same hash returns current state, not an obsolete preview. Rejected/expired drafts remain terminal.
- Save locks a pre-existing operation in one transaction. No durable `processing` lease or two-minute stale-worker recovery. Crash before commit leaves approval and no expense; crash after commit leaves replayable committed state.
- Full payload/results expire 30 days after terminal outcome; minimal idempotency tombstones remain until account deletion, including revoked connections. Reused old keys never create fresh drafts. Reconnection creates a new connection ID.
- After pruning, status/replay returns retained terminal state and expense ID, plus a live summary only if still an owned personal expense. Deleted/converted expenses return `expense:null,expense_unavailable:true`, never reconstruction or recreation.
- General request throttles apply to retries. New-draft quotas count new operations; create quotas count committed expenses; replay/status does not consume another create allowance.

Live summaries additionally require `expenses:read`. Reserve any financial-detail disclosure before returning it. If that budget is exhausted, a committed save/status still returns minimal state and expense identity with `detail_omitted:"read_budget_exhausted"`; never label a committed expense as a failed save or encourage a new key. Draft verification that cannot disclose its required preview/warnings fails before storing the draft.

### 3.5 `get_operation_status`

Input `{operation_id}`; only the same active connection may read it. Output includes `status` (`pending_approval|approved|committed|rejected|expired`), approval revision, expiry/decision timestamps and the relevant preview/link or committed expense reference. First-party UI can inspect its user's operations after revocation. Failed attempts are audit events, not durable `failed` operations; lock timeouts are transient errors.

## 4. Read tools

### 4.1 Catalog and legacy ambiguity

`list_categories({})` returns version, default write currency `USD`, main/sub IDs/names and `filter_supported`. Initially derive IDs from the backend taxonomy, deduplicate Utilities “Other”, then pin a manifest. Renames preserve IDs or use explicit aliases/versioning.

**Chosen v1 constraint:** storage remains the bare subcategory name. Ambiguous names return `category_id:null`, stored `category_name`, `category_ambiguous:true` on every expense read, including immediately after save. Unknown legacy names also have null IDs. Do not infer a main category or return different IDs across endpoints. The verification preview can show the selected full path but warns that legacy storage cannot preserve it.

Filters support globally unique subcategory names. A main filter is supported only if all its names are unambiguous; otherwise return `ambiguous_category_filter`, never a misleading partial total. Unfiltered breakdowns can show “Other (main category unknown)”. Persisted full paths remain the separate taxonomy roadmap item.

### 4.2 Shared expense representation

`ExpenseSummary`: `{id,date,amount,currency,category_id?,category_name,category_ambiguous,merchant,description,item_count,source,created_by}`. Source is `mcp|other|unknown`, based on stored provenance, never hard-coded. Agent provenance uses the retained safe client display name; other records use `you`/`unknown`. Provenance grants no authority.

Lists omit notes/cards/tags/fingerprints/user identity/internal FKs. Detail includes notes, tax/tip/discount and items with quantity/unit price/line total/discount/`original_price`/category ambiguity. Since TS-FIX-102 `line_total` is the paid price and `discount` a record when `original_price` is set; `original_price: null` marks an older receipt whose line total is before the header discount. Hide synthesized proxies based on the non-itemized expense type, not item count: real one-item receipts stay visible.

### 4.3 `list_expenses`

Required start/end dates, at most 366 inclusive days. Optional supported category ID, merchant substring (100 chars), text (100 chars; description/merchant/item names), currency, min/max amount, sort (`date_desc|date_asc|amount_desc|amount_asc`), limit 1–50 (default 20) and signed cursor. Validate min ≤ max. Cursor binds user/connection/filter/sort/last key with UUID tie-breaker.

Output `{items,next_cursor,total_count,totals_by_currency:[{currency,amount}]}`; aggregates cover the full filtered set, not just the page. No mixed-currency total. Use DB pagination, separate aggregates, item-name EXISTS and indexed ownership/date/sort predicates. Reserve disclosure budget before returning records.

### 4.4 `get_expense`

Input `{expense_id,items_cursor?}`. Ownership is `user_email=principal.user_email AND group_id IS NULL`; malformed/foreign/group IDs all return `not_found`. Page legacy item arrays at 200 with signed continuation, never silently truncate. Shared row budgets count the header and disclosed items.

### 4.5 Summaries/comparison

`get_spending_summary`: exactly one of `{year,month?}` or `{start_date,end_date}`, optional currency; no scope selector, default period or all-time mode. Output resolved period, `scope:"personal"`, count and currency-separated totals/category totals/monthly trend/top merchants (at most 10 per currency). Bound currency buckets and output bytes; require a currency filter if needed. Existing non-USD records are never relabelled USD or converted silently.

`get_category_breakdown`: same period/currency inputs, optional supported category ID, `compare_to_previous=false`. Return currency-separated totals/counts/percentages, current and previous periods and changes; percentage change from zero is null. Apply the shared comparison resolver to **both** current and previous ranges. Like-for-like applies to in-progress months/years; explicit custom ranges stay unchanged. Each query range is bounded.

Use shared Decimal aggregate-only methods, personal scope, `use_cache=False`, no detail-row materialization. Merchant analytics currently includes group shares and needs a personal path before reuse. Float analytics DTOs are not the MCP monetary source. Preserve existing REST response shapes in parity tests.

### 4.6 Optional/advanced reads

`parse_receipt_text({lines})`: 1–400 lines of at most 200 chars, deterministic `ReceiptService.parse_ocr_rows` only. Output `{draft,missing_fields,confidence,warnings}`; draft is partial and may not pass verification. Map categories honestly, invent no required values, persist nothing.

Phase 5 budgets/recurring reads require personal predicates, feature flags, decimal/currency-aware outputs, pagination and disclosure budgets. Due-expense confirmation is not exposed. Groups and updates need a new approved specification.

## 5. Service mapping and test obligations

| Contract | Shared implementation needed |
|---|---|
| Verify | Pure validators/reconciliation, catalog, cross-channel duplicate query, operation/audit persistence |
| Save | `ExpenseWriteService`, shared personal-write lock, approval gate, transaction-safe memory/tags, post-commit callbacks |
| List/detail | `ExpenseService.query_expenses/get_owned`, bounded items, provenance adapter |
| Summary/breakdown | Decimal aggregate-only personal queries and shared period resolution |
| Browser approval | First-party owned operation APIs; payload/revision-bound decision; no save side effect |

Every tool needs schema/SDK round trips, current-scope checks, cross-user/connection negatives, bounded output, redacted errors and flags-off tests. Financial tests cover exact Decimal results, ambiguous categories, non-USD existing rows, historical dates, real one-item receipts, three-decimal quantities, duplicate recheck and concurrent saves. The [plan](mcp-implementation-plan.md) specifies mandatory Postgres CI.
