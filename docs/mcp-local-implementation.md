# MCP local implementation and rollout runbook

Updated 2026-11-22 by Codex. The v1 implementation is present locally and remains **disabled by default**. Nothing has been committed, deployed or enabled in production as part of this work. The four MCP design documents remain the product/security requirements; this document records implementation details and the evidence still needed to enable them.

For commands to run locally and enable the existing GCP backend, see [local setup and GCP deployment](mcp-setup-and-deployment.md).

## Implemented behavior

- Official MCP SDK **2.3.0** owns Streamable HTTP and protocol negotiation at the exact `/mcp` path. The gateway requires a separate MCP bearer credential, validates canonical Host/Origin, bounds JSON bytes/depth and body-read time, charges shared counters, and limits concurrent gateway work. First-party cookies cannot authenticate MCP.
- Authlib **1.9.10** handles authorization-code/refresh grants and S256 PKCE. Discovery advertises only public-client authentication (`none`), code/refresh grants, and implemented scopes. Pre-registration and explicitly allowlisted CIMD are supported; DCR is absent. Metadata uses HTTPS, public-address validation, pinned destination addresses, TLS hostname verification, size/time limits and no redirects/proxies.
- Access tokens use a separate P-256 ES256 key, fixed issuer/resource audience, trusted key IDs, connection generation and a maximum ten-minute lifetime. Refresh tokens rotate atomically, store only hashes, have a 14-day idle/30-day absolute limit, and reuse revokes the connection. Grant expiry is 90 days. Old public verification keys can overlap during rotation.
- Consent uses a verified account's browser cookie, CSRF, original authentication no older than 12 hours and a live first-party session family. Refresh preserves original authentication time. Legacy sessions must sign in again. Consent GET does not bind/consume the request; POST records its user/session and consumes it once. Create access is opt-in and unavailable while writes are disabled. Accounts are limited to 20 active, unexpired connections.
- Personal-only tools: `list_categories`, `list_expenses`, `get_expense`, `get_spending_summary`, `get_category_breakdown`, `verify_expense`, `save_expense`, `get_operation_status`, `parse_receipt_text`. No group, direct-create, update, delete, upload or backend-LLM tool is exposed.
- Verify stores a normalized immutable draft. Browser approval records the exact revision/hash and warning acknowledgment, but inserts no expense. Save rechecks grant/control generations, expiration and duplicates and commits the expense/items, operation, write counters and success audit together. A new duplicate returns pending reapproval. Retrying the same operation never creates another expense, even after deletion or payload pruning.
- Historical purchase dates are accepted; writes are USD-only, amounts are strict decimal strings, and quantities support three decimals. Receipt parsing produces candidate lines for review; it does not guess a complete purchase or save anything.
- Reads use owned personal rows and Decimal SQL aggregates, separate currency totals, signed cursors and disclosure budgets. A pinned catalog fixture protects identifier stability. Legacy ambiguous category paths cannot be used as precise filters. Real one-item receipts remain visible.
- The web app has consent, approval/status, connection/disconnect and recent-activity pages. It distinguishes “approved, not saved” from committed. Both clients display assistant attribution; mobile opens the configured browser management page. Auth/approval routes do not initialize analytics. Referrers are suppressed by the web server.
- Sign out everywhere, password reset/change and takeover handling revoke MCP grants and outstanding approvals in the same transaction as first-party session invalidation. Single-device logout does not disconnect agents. Consent and approval recheck the live session after acquiring the user lock.
- User export includes connection/operation/activity/policy/usage/request data and expense attribution, excluding credentials and hashes. User FKs cascade on deletion. Disconnect retains provenance and operation identity.

## Code and transaction boundaries

Backend packages: `varavu_selavu_service/mcp/`, `oauth/`, and `db/mcp_models.py`. Financial persistence uses `ExpenseWriteService`, `ExpenseService` and `PostgresRepo` with flush-only options. A per-user PostgreSQL row lock serializes personal create/edit/delete, receipt replacement, personal-to-group conversion, and MCP duplicate checking. In-house chat, imports and recurring personal writes reach those same expense helpers. Existing REST response shapes and post-save behavior remain compatible; REST receipt headers/items now commit together.

Lock order for MCP execution is global control (shared), client (shared), user, connection, then operation. Logout/disconnect uses user then connection; global/client controls lock their own control row. Financial work has PostgreSQL lock/statement limits. Known lock/deadlock/query cancellations produce a retry/status response. Derived insight updates run after commit with a fresh session; failures do not change the financial result. They are best-effort and are not a durable job queue.

The operation stores both a nullable expense FK (`expense_record_id`, SET NULL) and a retained, non-authoritative expense ID. The retained ID reserves the outcome after deletion; every detail replay still checks current ownership and personal scope. Payload pruning sets SQL NULL, leaving the idempotency key/hash and terminal result identity intact.

Some schema values are normalized through references rather than duplicated: a code/refresh token's client and authorized scopes come from its connection, the resource is the single configured audience, and tool identity is encoded in the event or operation type. Counters use typed subject prefixes plus a cascading user FK. These references do not substitute for the runtime authorization checks.

## Schema rollout

Apply migrations before starting the new backend, even when MCP remains disabled: existing expense/auth/export paths reference the additive columns/tables.

1. `b49a6c2df803`, after `a6140ff1ccd2`: ten OAuth/MCP tables, indexes, nullable expense attribution/fingerprint and first-party `authenticated_at`.
2. `98f3d6b1a740`: `expense_items.quantity` Numeric(10,2) → Numeric(12,3).

The foundation downgrade permits reversal only when no connection has ever been retained. Once grants/tombstones exist, disable the feature and roll back compatible code rather than destroy those records. The quantity downgrade rejects data that would lose precision or range. Previous-schema upgrade/downgrade is tested on PostgreSQL, including actual FK creation. Production table-rewrite timing and lock budgets still need staging evidence.

## Configuration and operator commands

Run from `varavu_selavu_app/`. Use existing Poetry dependencies and the deployment secret manager. Never reuse `JWT_SECRET` or commit a private key.

| Setting | Default / purpose |
|---|---|
| `MCP_ENABLED` | `false`; mounts OAuth/MCP and first-party management routes when enabled |
| `MCP_WRITES_ENABLED` | `false`; independent deployment write switch |
| `MCP_RESOURCE_URL` | `https://trackspense-api.cerebroos.com/mcp` |
| `MCP_ISSUER` | `https://trackspense-api.cerebroos.com`; canonical HTTPS origin |
| `PUBLIC_APP_URL` | Existing first-party web origin; production must use `https://expense.cerebroos.com` |
| `MCP_TOKEN_SIGNING_KEY` | P-256 private PEM from secret management; required when mounted |
| `MCP_PREVIOUS_VERIFY_KEYS` | JSON array of previous public PEMs for an overlap window |
| `MCP_CIMD_ALLOWED_HOSTS` | Empty by default; exact approved metadata hosts only |
| `MCP_ALLOWED_ORIGINS` | Empty by default; approved browser/Inspector origins only |
| `MCP_APPROVAL_HOURS` | `24`; no policy can disable per-expense approval |

The migration initializes runtime writes to disabled. Deployment flags **and** runtime controls must permit writes. Example operator commands (change only the intended environment):

```sh
poetry run python scripts/mcp_admin.py --help
poetry run python scripts/mcp_admin.py register CLIENT_ID 'Client display name' https://verified-client.example/callback
poetry run python scripts/mcp_admin.py global read-only
poetry run python scripts/mcp_admin.py global writes
poetry run python scripts/mcp_admin.py global stop
poetry run python scripts/mcp_admin.py revoke USER_EMAIL --connection CONNECTION_ID
poetry run python scripts/mcp_admin.py suspend-user USER_EMAIL
poetry run python scripts/mcp_admin.py resume-user USER_EMAIL
poetry run python scripts/mcp_admin.py block-client CLIENT_ID
poetry run python scripts/mcp_admin.py unblock-client CLIENT_ID
poetry run python scripts/mcp_admin.py cleanup --batch-size 100
```

Do not invent callback URLs for Claude/ChatGPT: record the exact client metadata/registration requirements from the chosen app/account during acceptance. `--verified` is an operator assertion about a pre-registered client, not a consequence of valid TLS or an attractive client name. Resuming a suspended user or unblocking a client does not reactivate revoked grants.

Global control transitions increment a generation, so re-enabling writes never restores an old approval. Connection/client/user revocation is checked on requests, refresh and save. All operator controls generate redacted audit events. Uvicorn OAuth access logs omit query parameters; deployment/proxy logs must also be configured to avoid retaining authorization queries, cookies, bearer tokens and request/response bodies.

For key rotation, deploy the new private key together with the old public key in `MCP_PREVIOUS_VERIFY_KEYS`; keep the old verification key for at least the longest remaining access-token lifetime, then remove it. Cursors are bound to the current signing secret and may need restarting after rotation. Compromised keys should be removed immediately and affected grants revoked.

## Retention and recovery

Logical expiry applies even without cleanup. A bounded sweep runs on a sample of authenticated requests, and the CLI handles idle installations/backlogs. Drafts expire after 24 hours; full payloads/results/warnings are pruned 30 days after terminal status, audit after 180 days, and counters after two days. Codes/authorization requests are removed after their short validity plus a one-day retention buffer; refresh hashes remain through their absolute family deadline to detect reuse. Minimal operation tombstones and connection attribution remain until account deletion. Monitor cleanup lag; low traffic is not evidence of physical deletion. Backup retention remains governed by the infrastructure policy.

After a timeout, query `get_operation_status` or retry `save_expense` with the **same** operation ID. Never generate a new idempotency key to recover an unknown save outcome. Rejected/expired drafts need a new verified draft and approval. A newly discovered duplicate needs renewed approval of the returned revision.

## Local evidence and remaining launch gates

Focused portable tests cover strict inputs, catalog ambiguity, verify/approval/save, retries, duplicates, rollback, expiry, control generations, export/deletion, tombstone retention and session revocation. Synthetic OAuth tests exercise PKCE, code exchange, refresh rotation/reuse, RFC 7009 revocation, CSRF/session freshness, metadata SSRF rejection and the actual SDK transport. PostgreSQL tests cover same-key verification, exactly-once saves, different-key duplicate races, first-party/MCP creation, revocation, atomic quota limits, exact quantity round trips and real migration DDL. `.github/workflows/unit.yml` adds a dedicated **MCP PostgreSQL transactions and migrations** job; GitHub has not run this uncommitted workflow yet.

Web RTL and mobile tests cover approval warnings/status, empty/error states, disconnect and the browser link. Local Chromium checks exercise warning acknowledgment and approval without saving at desktop/phone widths, in light/dark themes, with axe. This is not a manual screen-reader certification or a physical-device acceptance test.

Before enabling production, obtain:

- Exact Claude app/account interoperability first, then ChatGPT: registration/redirects, protocol negotiation, refresh concurrency, scopes, browser return and recovery. Synthetic SDK tests do not establish real-client eligibility. Strict refresh-reuse revocation needs explicit client-concurrency acceptance.
- Staging migration/quantity rewrite timing and load/query-plan/REST-contention measurements under the production database/worker limits. Local PostgreSQL tests prove behavior, not production capacity.
- Deployment IAM/ingress/forwarded-header/CORS/Host checks, secret distribution/rotation, log redaction, cleanup monitoring and current privacy/backup-retention review.
- Passing CI on the actual release commit and the PostgreSQL check configured as required in branch protection. No commit, push, branch-protection change or deployment occurred here.

Native approval UI, groups, advanced budget/recurring tools, update/delete and bulk operations remain outside v1.

## Review fixes — 2026-11-22

- Read-only operation responses compute logical expiry without persisting a stale status. Locked transitions and cleanup own persisted expiry; a PostgreSQL regression overlaps browser reads with an uncommitted save across the deadline.
- OAuth token/revoke bodies have a ten-second total read deadline and 16 concurrent requests per worker. Database checkout starts after receipt; synchronous rate-limit/token/revocation work runs in a worker thread. Revocation attempts now also use shared IP counters.
- Refresh tokens follow the approved 30-day absolute / 14-day inactivity policy, including rotation and boundary tests.
- CIMD uses cancellable async DNS and HTTP under one three-second deadline, preserving public-IP pinning, TLS hostname verification and no redirects/proxies. It rejects compressed responses and IP-literal client URLs; tests cover slow DNS, trickled headers/body and mixed public/private DNS answers.

Post-fix validation: full area verification and audits passed (web 224 tests, mobile 209 tests); final backend run passed 969 tests with 15 environment-specific skips. An explicit MCP run with dedicated PostgreSQL passed all 60 tests, including 8 PostgreSQL transaction/migration tests. Changed Python files passed Ruff correctness/format checks; setup shell examples passed syntax checks. Sequential implementation/product/test/security/performance self-review found no remaining instance of the five findings. UI behavior was unchanged in the fix pass; earlier responsive/axe evidence still applies. Actual Claude/ChatGPT and staging acceptance are still pending.
