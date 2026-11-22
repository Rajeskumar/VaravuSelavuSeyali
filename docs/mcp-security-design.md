# TrackSpense — MCP Security Design

> **Status:** Approved security requirements, 2026-11-21. Local v1 controls and tests are implemented behind default-off flags; see [implementation evidence and rollout](mcp-local-implementation.md). This is not production enablement or live-client certification.
> **Companions:** [review](mcp-integration-review.md) · [tools](mcp-tool-specification.md) · [plan](mcp-implementation-plan.md)
> Every external agent is an untrusted client acting for a user. Authentication, validation and human approval are separate requirements.

## 1. Decisions and threat model

Approved launch scope: Claude app first, ChatGPT second; personal reads/writes only; every addition uses `verify_expense` → first-party browser approval → `save_expense(operation_id)`. Sign out everywhere disconnects agents too. Historical receipts are allowed and checked for duplicates. No automatic saves, threshold exceptions, group summaries, updates, deletes or export tool in v1.

Assets: financial records and accuracy, private spending data, first-party/MCP credentials, DB and cloud credentials, service capacity. Actors: legitimate users, mistaken/prompt-injected agents, malicious clients, token thieves, other users and unauthenticated Internet attackers.

| Boundary | Enforcement |
|---|---|
| OAuth authorization server | First-party login/consent, registered client, exact redirect, PKCE, bound scopes/resource |
| MCP gateway | Bearer-only MCP auth, current grant and block status, registry, schemas, shared quotas |
| TrackSpense approval UI/API | First-party user session; stored payload/revision; POST + CSRF; MCP tokens rejected |
| Financial services/database | Ownership, per-user write serialization, approved operation lock, one transaction |
| External AI client | Receives authorized data; its text/confirmation is not proof of TrackSpense approval |

The plan must withstand a client that deliberately calls save without showing a preview. There is no tool that grants approval. An agent can submit drafts and read its granted personal data, but cannot commit an unapproved draft. Removing an export tool does not eliminate extraction through authorized reads; bounded disclosure is mitigation, not a promise that data cannot leave the provider.

## 2. Deployment and protocol

Mount the isolated `mcp/` package in the existing FastAPI app (Option A), at exactly `https://trackspense-api.cerebroos.com/mcp`. The SPA is `expense.cerebroos.com`; it is not the API. Code imports services/core/db/auth helpers, never route handlers. A separate Cloud Run entrypoint from the same image remains possible later.

Streamable HTTP with JSON responses and no application transport session/affinity. Use a pinned official Python SDK; execute sync DB service work in a thread with its own Session. Explicitly manage SDK lifespan and mount path; tests must call `/mcp`, not an accidental `/mcp/mcp` or redirect-dependent URL.

Baseline reviewed: MCP 2026-07-28. Recheck and record actual SDK/client versions in Phase 1. The baseline removes protocol sessions and requires per-request metadata and matching headers; stateless configuration alone is not conformance. Define supported versions and legacy behavior explicitly, including discovery, requests/notifications, method/version/name header validation, content negotiation and errors. Do not advertise unsupported capabilities.

Validate Origin when present, reject invalid origins with 403, and allow legitimate server-to-server requests without Origin. CORS is a separate browser policy: default deny for external browser origins; approved Inspector origins only in local/staging without cookie credentials. Bind local development to loopback. Validate Host/forwarded-host against deployment configuration, and derive issuer/audience/approval URLs from configuration, never request headers. Protect the `*.run.app` path with the same application checks; do not claim Cloudflare protects the DNS-only API.

Gateway limits: 256 KiB actual streamed body (not just Content-Length), JSON depth 20, bounded parsing/validation, tool and DB statement/lock deadlines, bounded worker/pool concurrency. No long waits for approval inside an HTTP call. Apply no-store headers to sensitive MCP/OAuth/consent/approval responses; public metadata may be separately cached. Existing `/api/`-only cache headers are insufficient for new paths.

## 3. OAuth and authentication

### 3.1 Provider choice and discovery

Authlib-based in-house AS is the working implementation choice, subject to the client interoperability/security prototype; a failure is a decision checkpoint, not permission to weaken protocol requirements. Existing password/Google login authenticates the user; no separate password form or identity migration. Managed-AS claims about cost or identity syncing require actual evaluation if revisited.

- RS: canonical `/mcp` URL. Issuer: `https://trackspense-api.cerebroos.com`.
- `GET /.well-known/oauth-protected-resource/mcp`: canonical resource, issuer, enabled issuable scopes, Bearer header only.
- `GET /.well-known/oauth-authorization-server`: authorize/token/revoke URLs, authorization_code/refresh_token grants, S256, supported scopes and actual client-auth methods.
- Initial v1 client authentication method is `none` for registered public clients with PKCE. **Do not advertise `private_key_jwt`** without implementing trusted JWKS acquisition, algorithm/audience/issuer checks, exp/jti replay protection and key rotation. If a required client needs another method, add it with tests before advertising it.
- Unauthorized `/mcp` returns the protected-resource metadata challenge; insufficient scope uses the standards-compliant step-up challenge. Newly granted scopes still require first-party consent.

### 3.2 Registration and remote metadata

Pre-registered clients plus host-allowlisted CIMD; DCR off by default. Compatibility must be demonstrated for the exact Claude app and ChatGPT account surfaces, not inferred from free/pro labels. If a required client needs DCR, prefer pre-registration if supported; otherwise separately review DCR validation/quotas/lifecycle before enabling it. Current baseline marks DCR deprecated, retained for compatibility.

CIMD is the only planned outbound metadata fetch. Use an HTTPS URL with path, no credentials, port 443, max 512 characters and explicit hostname allowlist. Empty allowlist disables fetch. Resolve and reject all non-public addresses (including metadata/link-local, loopback, RFC1918, CGNAT, IPv6 ULA, mapped IPv4 and reserved ranges); pin the validated IP while preserving TLS hostname verification/SNI. Reject redirects. Enforce one 3-second total deadline across DNS, TCP, TLS, headers and body, a 32 KiB streamed/decompressed limit and JSON content type. The initial implementation requests identity encoding and rejects compressed responses. Never fetch arbitrary logo_uri, client_uri or jwks_uri. Use bundled icons/text unless a separately reviewed asset fetch path is added.

Validate exact document client_id, bounded required metadata, redirect URIs (HTTPS, no fragment/userinfo; narrowly supported native loopback exception), safe display names and declared auth method. Host allowlisting alone is not an automatic verified badge; verification is an admin-controlled client-identity decision. Respect HTTP cache headers with a bounded maximum age; no stale metadata used beyond policy. Restrict per-client refresh frequency, including failures. Blocked clients cannot fetch their way back into service.

Least-privilege runtime IAM is a production gate before enabling metadata fetching. The repository documents `roles/editor`; verify actual production IAM, then split runtime/deploy privileges. Local tests must prove SSRF refusal before connecting, including DNS rebinding.

### 3.3 Authorization, consent and code redemption

1. `/oauth/authorize` validates registered client, exact redirect, requested issuable scopes, canonical resource and PKCE S256 **before redirecting**. Store a random 256-bit, 10-minute authorization request; never redirect errors to an unvalidated URI.
2. Redirect to SPA `/connect/authorize?req=<opaque>`. User logs in normally and views the client identity, redirect host, exact scopes, personal-only restriction, third-party data disclosure and mandatory browser approval for writes.
3. First-party GET reads the request without claiming or approving it; the first valid approval/denial POST atomically binds and consumes it for the authenticated user/session. Require cookie + CSRF and original authentication within 12 hours; refreshed access-token iat is not proof of recent login. Add a trusted session `authenticated_at` / signed `auth_time` and session-family reference propagated during refresh; legacy sessions lacking them must reauthenticate. Both Google/password logins establish them. Replays by another user or session cannot rebind a consumed request.
4. Atomically consume the request once, record consent version/scopes, create a **new** connection/grant, and issue a random 256-bit hashed authorization code (60-second expiry). Bind client, redirect, resource, PKCE challenge, connection and scopes. Return state and issuer securely to the validated redirect. No cached pending request can be approved twice or for another user after binding.
5. Token redemption validates all bindings and verifier before atomically consuming the code and inserting the initial token family. Legitimate-proof code replay revokes the grant's issued tokens; a guessed code/wrong verifier must not become a denial-of-service revocation primitive.

Login return navigation preserves only the opaque request reference, not arbitrary redirect targets. Consent/auth pages must not load analytics or untrusted client imagery. Avoid credentials in logs/history/referrers; redact authorization query parameters and OAuth request/response bodies in application and platform logging configuration. Codes remain short-lived even where platform request-URL retention cannot be fully eliminated.

### 3.4 Tokens and current-grant validation

Access tokens: separate signing key (ES256 working choice), pinned algorithm, trusted `kid` key ring, 10-minute maximum lifetime bounded by grant expiry. Claims: issuer, canonical audience, connection ID subject, client ID, scopes, `iat`, `exp`, unique jti and an unambiguous `mcp+at` type. Preserve first-party key/type isolation in both directions. Support overlapping verification keys during rotation, never algorithm inference from untrusted headers.

Every authenticated MCP request checks signature/claims/time, then joins connection/user/policy/client. Reject revoked/expired connections, missing users, suspended users, blocked clients, invalid grant generation/cutoff and global disable. Effective scopes = token ∩ current grant. Apply writes-enabled checks only to preparation/execution, not to safe status reads. MCP ignores cookies entirely. First-party APIs never accept MCP credentials.

Refresh tokens: opaque 256-bit values stored hashed; connection/client/family-bound; 30-day **absolute family** lifetime, 14-day inactivity lifetime. Persist family origin, absolute deadline, last use, predecessor/successor and revocation fields. Rotation must retire old token and create successor in one transaction with row locking/conditional update; successors cannot extend the absolute deadline or scopes.

Initial design has no refresh grace that mints multiple descendants. Serialize refresh; reuse of a consumed token revokes the family and connection, including outstanding access tokens and approvals. Verify clients handle refresh single-flight in the prototype. Any grace/retry accommodation needs a separately specified replay-safe successor scheme and tests, not copying the existing branching first-party algorithm. Never revoke a grant on an unauthenticated guessed token; confidential-client proof, if supported, precedes token actions.

### 3.5 Revocation and session events

`POST /oauth/revoke` implements RFC 7009: form `token=<actual access or refresh token>`, optional hint, client validation/binding; do not accept a bare access jti as the credential. Valid revocation ends that connection/grant and its refresh family; unknown/already-revoked token gives the standard non-disclosing response. This endpoint never consumes ambient cookie authority. Exempt only token/revoke protocol routes from first-party CSRF; consent and approval POSTs remain protected.

| Event | MCP effect |
|---|---|
| Single-device logout | No agent disconnect |
| Sign out everywhere | Revoke all connections, refresh families and outstanding access tokens; reject pending/approved drafts; require reconnection |
| Password reset/change or takeover guard | Same all-agent revocation |
| Disconnect agent | Revoke its connection/family and invalidate its approvals |
| Scope reduction | Reduce current grant and revoke affected pending/approved operations; old token cannot restore removed scope |
| Pause writes | Block new verify/save; invalidate outstanding approvals so resuming cannot silently save an old approval |
| Suspend all agents / client block | Deny new calls and invalidate executable approvals; resumption requires fresh approval |
| Account deletion | Delete personal expenses and all user-associated MCP data, credentials, payloads, counters and tombstones |

`AuthService.end_all_sessions` is used for several reasons; hook the agreed events explicitly and atomically where needed. Do not accidentally disconnect agents on ordinary single-device logout. Reconnection never reactivates an old connection row. Security cutoffs must have sufficient precision to distinguish same-second changes.

## 4. Policy, independent approval and concurrency

`Principal` carries token-derived user/connection/client/effective scopes. A shared pure decision function evaluates enabled flags, ownership, current grant and operation type. Side-effecting quotas/locks are separate. First-party REST keeps its own auth and does not acquire MCP-specific scopes or browser approvals; it does participate in personal-write serialization where required for duplicate safety.

### 4.1 Operation state machine

```text
verify → pending_approval → approved → committed
                  │             │
                  └─ rejected   ├─ pending_approval (new duplicate warning/revision)
                  └─ expired    └─ rejected / expired (revocation / deadline)
```

No durable processing/failed lease. Expiry is absolute 24 hours from verify; successful approval does not extend it. Each operation stores immutable payload/hash, canonicalization version, approval revision and warning/duplicate snapshot. Payload changes require a new draft. Agent cannot approve, edit the pending payload or select approved status.

The first-party approval page displays exact stored fields, selected category and storage ambiguity, purchase date, money, items, totals mismatch and duplicate references. User POST supplies the displayed revision and explicit warning acknowledgements. Check ownership, fresh session, CSRF, expiry and current connection policy; atomically transition once. Reject stale revisions. Approval records user/session/time, payload hash and warning snapshot. Approval does not commit an expense. UI states that the assistant must finish saving; no surprise background save. Repeated approval/rejection is harmless and cannot issue a new authorization.

First-party management endpoints (proposed, all owned-user scoped; cookie + CSRF on mutations, native first-party Bearer permitted where the UI supports it):

| Endpoint | Contract |
|---|---|
| `GET /api/v1/oauth/requests/{id}` | Validated, unexpired client/scope/redirect/consent preview; never approves |
| `POST /api/v1/oauth/requests/{id}/approve` or `/deny` | Consume once; selected scopes must be a subset of requested/issuable scopes; validated redirect response |
| `GET /api/v1/ai-connections` | Paged current/retained connections, safe grant/provenance/status metadata |
| `PATCH /api/v1/ai-connections/{id}` | Pause/resume writes or reduce scopes only; expansions require new OAuth consent; invalidate approvals on restriction changes |
| `DELETE /api/v1/ai-connections/{id}` | Logical disconnect, token/approval revocation; retain tombstones/provenance |
| `PUT /api/v1/ai-connections/policy` | Set account suspension only; no approval-bypass settings |
| `GET /api/v1/ai-connections/operations` and `/{operation_id}` | Paged owned operations and stored preview/current state, including disconnected agents |
| `POST /api/v1/ai-connections/operations/{id}/approve` or `/reject` | Displayed revision and warning acknowledgements; first-party recent-auth check; no financial save |
| `GET /api/v1/ai-connections/{id}/activity` | Paged safe audit events; no credential or receipt-text logging |

The shorthand `/{operation_id}` above is relative to `/api/v1/ai-connections/operations`. Every by-ID endpoint returns the same not-found result for absent/foreign IDs. Register fixed routes ahead of dynamic IDs where framework matching requires it. Endpoint API tests cover ownership, validation, CSRF and revocation, not merely UI hiding.

### 4.2 Locking and execution gate

All personal expense creation paths (REST simple/itemized, in-house chat, recurring confirmation and any import path), and edits/deletes that affect duplicate detection, must share a short **user-row `FOR UPDATE` lock** and transaction-owning write service. This covers both historical and new first-party expenses; a nullable fingerprint alone is insufficient. Group writes remain outside v1.

MCP save lock order: global-control row (shared) → client row (shared) → user row (exclusive) → connection → operation. Revocation/suspension endpoints use the corresponding order; never acquire earlier locks after later ones. User-owned first-party writes only require the user lock. Client/global operators acquire their control row exclusively; no nested acquisition in reverse order. Review the complete lock graph and test deadlocks/lock timeouts on Postgres.

Inside the save transaction, recheck current global controls, client block, user suspension, active grant, scopes, write switch, expiry, operation ownership and matching approval. Then check duplicates, atomically reserve committed-write counters, insert expense/items, transition operation, append success audit and commit. Revocation has a defined order: if it acquires the gate first, the save is rejected; if save commits first, revocation does not undo it. Do not promise to cancel an already committed operation.

Fail closed on policy/DB failures. There is no “allow” based only on a previously checked gateway object. A handler cannot execute outside the registered gate.

### 4.3 Duplicate detection

A probable duplicate is an existing owned personal expense with equal currency/amount, purchase date within ±1 day and matching normalized merchant-or-description. Store/index a **date-independent** SHA-256 content fingerprint over currency, canonical amount and normalized merchant-or-description; user ownership is always a separate query predicate. Compare date separately. Existing rows with null fingerprint use the equivalent normalized fallback until an idempotent bounded backfill completes. All shared personal writers populate/recompute the fingerprint; edits update it. No unique expense constraint: legitimate repeated purchases are allowed after informed approval.

Verification and approval show matches; save repeats the query under the per-user lock. Hash the reviewed duplicate IDs and relevant date/amount/currency fields. Any new/changed matching record requires another approval revision; disappearing matches do not authorize an additional expense. Keep warnings for uncertain OCR/date differences; no heuristic guarantees detection of differently described duplicates.

Two differently keyed drafts can both be approved before either saves. The first commits; the second then discovers it under the lock and returns to pending approval. Same-operation concurrent saves serialize and replay. Test MCP/MCP and MCP/REST/chat/recurring races. These guarantees are not satisfied by same-key unique constraints alone.

### 4.4 Transaction boundaries and failures

Verify commits draft+audit only. Approve commits the decision only. Save commits expense+items+committed operation+success audit+committed-write counters together. Unique `(connection,tool,key)` claims protect verification, and the existing operation row protects save. Bound waits instead of inventing stale-processing recovery.

`ExpenseWriteService` owns the financial transaction boundary. Participating helpers only flush: audit category-memory/tag/repository helpers for inner commits and rollbacks. `CategoryMemoryService.record` currently commits/rolls back and must change. Optional best-effort memory uses an isolated savepoint or a separate post-commit session; never swallow an error then roll back the outer financial transaction. REST wrappers preserve existing response shapes while gaining atomic itemized writes.

After commit, cache invalidation and existing insight callbacks run with explicit session lifetime. Callback failure never changes save success or prompts expense recreation. MCP aggregates query authoritative rows, so they do not depend on eventual callbacks. Existing callback durability/cross-instance web cache limitations remain documented; a durable outbox is a separate future improvement if those guarantees are required.

If save crashes before commit, no expense is present and the prior approval remains; after commit, status/replay finds the same expense. Failure audits use a separate bounded transaction after rollback, without overwriting committed state. For ambiguous transport outcomes, inspect status then retry the **same** operation if needed, never automatically generate a new draft/key.

## 5. Rate limits, disclosure and capacity

Postgres atomic conditional counters across instances; no Redis initially. Distinguish request abuse counters (charged even on failed/replayed calls, separate short transaction), new-draft reservations, successful-create counters (same financial transaction), and disclosure budgets (reserved before returning records). Multi-bucket updates follow a fixed order and roll back together; weighted increments enforce `count + requested <= limit`, including first insertion. Account/connection subjects are typed foreign keys where applicable, not undeletable emails embedded in strings.

| Bucket | Starting limit (configurable without an approval bypass) |
|---|---|
| Authenticated MCP requests | 60/min/connection, 1,000/day/connection, 2,000/day/user |
| New verification drafts | 10/min/connection, 100/day/user; max 100 open drafts/user |
| Successful saves | 10/min/connection, 100/day/user, 2,000/hour/global |
| Successful itemized saves | 30/day/user, also within general saves |
| Disclosed records/items across list/detail/duplicate/status results | 2,000/day/connection and 2,000/day/user across connections |
| Receipt text parsing | 20/hour/connection |
| OAuth authorize/token | 30/min/IP plus shared per-client/global abuse ceilings |

Committed replay and status consume request/read budgets but no new-draft/create quota. Pending/rejected drafts are not successful creates. Account deletion removes user counters; reconnection does not reset user budgets. Clearly communicate date bounds, rate resets and retry delays. Approval management endpoints have independent first-party limits so an agent cannot exhaust the user's ability to disconnect/reject.

Disclosure failure must not turn a completed financial write into an apparent failure. After commit, save/status can return minimal terminal state and expense identity without financial detail, as specified in the tool contract. Draft preparation must reserve enough disclosure budget for its required preview/warnings before creating the draft. Current expense lookup on replay also needs expenses:read; create-only grants do not gain access to later user edits.

Bound aggregate buckets/output bytes separately from raw records. Pagination, get-by-ID and operation replay must not bypass disclosure accounting. Authorized clients can still extract allowed data; no-export is capability minimization, not exfiltration prevention. Larger historical imports can use repeated verified receipts within limits; no bulk approval or bulk write exemption is added.

No-cache aggregate-only personal reads, bounded queries, composite user/date/id and user/amount/id indexes, item-search EXPLAIN and realistic volume tests are release requirements. Dropping detail arrays after loading them is not optimization. Pool/worker concurrency and simultaneous REST+MCP traffic must be measured on the existing 1 vCPU/512 Mi deployment; multiple quota upserts and audit writes are not “one query per call” or guaranteed zero cost.

## 6. Input, output and prompt injection

Tool spec is authoritative for strict decimal-string/date/category schemas, 200-item writes, historical receipts, USD-only writes, currency-separated reads and ambiguity errors. All values and schema nesting are bounded. Map `op_…` IDs separately from UUID expense IDs. Do not return first-party notes in list output; detail notes are explicitly within expenses:read.

Financial reads use only `user_email` from the connection and `group_id IS NULL`. No group totals or group-authored merchant/description fields. Output minimizes identifiers/free text and labels untrusted data. An injected description can influence an external model, but cannot grant approval. Receipt parsing never invokes a backend model or fetches a URL. Client/provider data disclosure is consented separately from TrackSpense's own AI consent gate.

## 7. Persistence, audit and retention

The v1 tables use schema `trackspense`; user identity remains email. This is a schema migration, not a datastore migration. Ten new tables initially, plus additive expense/session columns; item quantity expansion is a separate Phase 4 migration.

| Table | Required fields/constraints |
|---|---|
| `oauth_clients` | client_id PK, bounded name/redirect metadata, registration method, verified/blocked, metadata expiry/fetch times, actual auth method |
| `oauth_authorization_requests` | random ID, validated client/redirect/resource/scopes/PKCE/state, expiry, bound user/session, consumed/denied time; user FK CASCADE once bound |
| `oauth_authorization_codes` | code hash PK, connection FK CASCADE, bound client/redirect/resource/PKCE/scopes, expiry/used_at, issued family reference |
| `mcp_connections` | UUID PK, user FK CASCADE, client FK, retained safe name, consent time/version/scopes, active/revoked status, writes_enabled, token cutoff/generation, absolute grant expiry, last use/revocation reason |
| `mcp_refresh_tokens` | hash PK, connection FK CASCADE, client/family, family origin/absolute deadline, issued/last-used/expiry, revoked reason/time, replaced_by; atomic rotation indexes |
| `mcp_user_policy` | user PK FK CASCADE, suspended_at; **no approval mode/threshold** |
| `mcp_operations` | op ID PK, user/connection FKs CASCADE, tool/key unique, request hash/canonicalization version, immutable payload/hash, status, expiry, approval revision, reviewed warning snapshot, approved hash/revision/session/time, approved global/connection control generations, expense FK SET NULL plus retained non-authoritative expense ID, result, terminal/pruned timestamps |
| `mcp_rate_counters` | typed subject kind and FK user/connection/client where applicable, bucket/window/count; unique subject/bucket/window; purge indexes; deletion covers all user-linked subjects |
| `mcp_audit_events` | ID/time, user FK CASCADE, connection/client/tool/op references, correlation, outcome/reason, safe expense reference, redacted changes, minimized network metadata |
| `mcp_global` | singleton with disabled/writes_disabled, generation, updated_at; present in migration and operator CLI |

Expense alterations: nullable `created_by_connection_id` FK SET NULL and date-independent `dup_fingerprint`, plus scoped lookup indexes. Keep revoked connections for provenance/idempotency, not physical deletion on disconnect. Original first-party login time: nullable `refresh_tokens.authenticated_at` plus propagated signed auth_time; legacy sessions require reauthentication for consent/approval rather than fabricated login age.

Phase 4: widen `expense_items.quantity` from Numeric(10,2) to Numeric(12,3) before enabling itemized verification. Confirm table rewrite/lock behavior with production-sized staging data and a bounded maintenance/expand strategy. Downgrade must refuse values that would lose precision, not silently round them. Migrations use random hex IDs, preserve prior-version compatibility, and are exercised from the previous schema, not only create_all.

Audit every draft/save attempt, denial, decision, commit/replay, consent, revocation, refresh reuse and kill-switch event. Record IDs, outcome, counts and limited amount/date/category deltas. Never log tokens/codes/verifiers, full descriptions/notes/receipt text, full emails or full IPs in operational logs. Never let logging failures accidentally commit a financial transaction. Audit success is part of save's transaction; abuse logs are bounded to avoid becoming a storage DoS.

| Data | Retention / cleanup |
|---|---|
| Unbound authorization requests / codes | Expire after 10 min / 60 s; bounded cleanup of expired/consumed material within 24 h; retain minimal consumed-code replay marker through grant lifetime, without state/PKCE text |
| Draft/result payloads and warning snapshots | Open operations expire after 24 h; purge full payload 30 days after terminal outcome |
| Operation tombstones | Minimal ID/key/hash/version/status/expense reference until account deletion; no old receipt text; bounded creation quota limits growth |
| Refresh material | Keep hashes/reuse markers through absolute family lifetime plus short operational cleanup window; never raw credentials |
| Audit | 180 days, then bounded pruning; account deletion earlier |
| Rate windows | Purge windows older than two days; account deletion also removes user subjects |
| Clients/metadata | Bounded metadata cache; prune unused unreferenced clients, never delete referenced grants implicitly |

Cleanup is request-triggered in bounded batches with indexes and a CLI for idle installations/backlogs. Logical expiry is checked on access even if no cleanup runs. Document that physical retention depends on cleanup execution; monitor lag and run CLI when request traffic is absent. Never delete a tombstone merely to reclaim its full payload. Backups follow the separately documented infrastructure policy.

Before any production read release, account export includes safe connection/consent/policy/audit metadata; once writes exist, it includes retained operations/approvals and provenance. Exclude credential hashes, codes, PKCE and internal auth secrets. Deletion tests cover bound OAuth data, all MCP rows/counters, payloads/tombstones and personal expenses. Do not defer user rights to Phase 5.

## 8. Controls, UI and rollout

Environment `MCP_ENABLED=false` prevents mounting by default. DB `mcp_global` provides runtime read/write stop; global control is read in the financial transaction (no cached write authorization). Optional read-path cache is at most 15 seconds and explicitly documented; connection revocation is checked every request. Operator CLI changes controls and client blocks with audit. Kill switch prevents new work; it cannot undo committed expenses. Re-enabling global writes invalidates pre-stop approvals through a control generation check.

Read-only production release already includes consent, connection list/disconnect, suspension, basic activity, export/deletion and privacy disclosure. Write release adds browser approval/rejection, pending/approved states and “Added by <agent>” provenance in **web and mobile**. Mobile gets a reachable management-page link; native approval UI is deferred. A revoked connection's retained name remains safe attribution, not a live link to authority.

After a successful financial save, the next first-party refresh/focus sees it. Approval itself does not change expense totals. First-party pages observing committed status invoke `refreshExpenseViews`; cross-tab/focus behavior is tested without claiming instantaneous push sync. Include loading/error/expired/reapproval/approved-but-not-saved states, accessible names, keyboard/focus handling and announced errors; no dangerous nested interactives.

Alerts before write release: global breaker, repeated denials/refresh reuse, cleanup lag, quota saturation, high DB latency/pool exhaustion and CIMD fetch failures. Basic per-user activity ships at launch; advanced anomaly baselines can follow. Do not claim anomaly detection exists before its phase.

Residual risks: authorized read disclosure to the external provider; phishing of a consent screen; user approves an incorrect receipt despite clear preview; duplicate heuristics miss changed descriptions; callback failure leaves ancillary insights stale. Approval reduces agent autonomy but does not guarantee user intent or OCR accuracy. Client/AS interoperability, runtime IAM, actual account-tier eligibility and capacity remain evidence gates, not completed facts.

## 9. Protocol references

- [MCP Streamable HTTP, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) and [URL elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
- [RFC 7009 token revocation](https://www.rfc-editor.org/rfc/rfc7009), [RFC 9728 resource metadata](https://www.rfc-editor.org/rfc/rfc9728), [RFC 8414 AS metadata](https://www.rfc-editor.org/rfc/rfc8414), [RFC 8707 resource indicators](https://www.rfc-editor.org/rfc/rfc8707)

Revalidate standards and SDK/client behavior during implementation. These links support the protocol design, not a claim that the repository already implements it.
