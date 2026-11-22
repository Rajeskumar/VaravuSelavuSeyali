# TrackSpense — MCP Implementation Plan

> **Status:** Local v1 code, additive migrations and tests implemented on 2026-11-21, with default-off flags. **No commit, deployment or production enablement.** See [implementation evidence and rollout](mcp-local-implementation.md) for concrete coverage and unfulfilled external gates.
> **Review fixes (2026-11-22):** Expiry/save concurrency, OAuth request resource bounds and event-loop work, refresh-family lifetimes, and metadata total deadlines are corrected and regression-tested. [Local/GCP setup and enablement](mcp-setup-and-deployment.md) is documented; real-client/staging/CI acceptance remains outstanding.
> **Companions:** [architecture review](mcp-integration-review.md) · [tool contract](mcp-tool-specification.md) · [security design](mcp-security-design.md)
> This plan replaces the earlier direct-create/threshold proposal. Implementation must follow AGENTS.md: focused tests, relevant deterministic checks/reviews, web/mobile parity, documentation maintenance and uncommitted changes unless asked.

## 1. Approved decisions and implementation checkpoints

| ID | Decision | Resolution |
|---|---|---|
| D1 | Deployment | Existing FastAPI/Cloud Run service, isolated MCP/OAuth packages; canonical API `/mcp`; split service remains possible later |
| D2 | Authorization server | Authlib-based in-house AS working choice; prove interoperability/security in Phase 1 before committing to full implementation. Revisit if required client behavior cannot be supported safely |
| D3 | Registration | CIMD host allowlist + pre-registration; DCR off unless compatibility proves it necessary and its addition is separately reviewed |
| D4 | Writes | **Every addition requires approval.** `verify_expense` → TrackSpense browser approval → `save_expense`; no automatic saves/thresholds/bypass settings |
| D5 | Data scope | Personal only for all v1 reads, summaries and writes. Groups later, separately reviewed |
| D6 | Mobile | Responsive browser approval accepted; native approval screen later. Mobile attribution and reachable connection-management link ship with writes |
| D7 | Kill switches | Default-off mount flag plus DB-backed runtime global/read/write controls |
| D8 | Limits | Shared Postgres counters; separate request/new-draft/committed-write/disclosure budgets |
| D9 | Other mutations | Updates/deletes/bulk writes excluded. Future scope requires a new decision, not automatic inclusion in Phase 5 |
| D10 | Receipts | Itemized variant of verify in Phase 4; deterministic text parser optional client capability, included in that phase |
| D11 | Clients | Claude app first, ChatGPT second. Other clients deferred; exact account/app eligibility is tested, not inferred from subscription names |
| D12 | Sessions | Sign out everywhere, password reset/change and takeover guard revoke agents and outstanding approvals; single-device logout does not |
| D13 | Historical expenses | Accept valid past dates without a rolling three-year cutoff. Detect possible duplicates at verify and again at save |
| D14 | Approval semantics | Browser decision authorizes the immutable draft but does not save. Save accepts only operation ID, commits once, and rechecks policy/duplicates |
| D15 | User rights/visibility | Export/deletion and basic connection activity are production prerequisites, not Phase 5 work |

Engineering resolutions from the audit: one financial transaction with transaction-safe helpers; no persistent processing leases; serialized cross-channel duplicates; current-grant checks; decimal/currency-aware aggregate-only reads; explicit legacy category-filter limits; three-decimal quantity migration before receipts; mandatory Postgres CI and migration tests. These are implementation obligations, not claims that tests have passed.

Working operational defaults: 24-hour approval lifetime; USD-only writes; date ≤ UTC today + 1 day; 366-day read ranges; limits/retention in security design. These defaults may be tuned within the approved security model. There is no approval policy setting to tune away mandatory approval.

## 2. Phases and exit gates

No fixed schedule is promised before the compatibility prototype and transaction extraction establish scope. The former single “security foundations” estimate hid multiple substantial work streams.

### Phase 0 — Revised design (this deliverable)

Update all four MCP documents, roadmap, approved key decisions, product-spec planned-feature pointer and changelog. Keep implemented-feature tables and deployed architecture distinct from this future design. Trace the audit in §4 below.

### Phase 1 — Compatibility prototype and security foundations

| Task | Work / likely files |
|---|---|
| 1.1 Client/protocol spike | Test exact Claude app/account first and ChatGPT next; record transport versions, registration, redirect URIs, refresh concurrency, scopes, client auth and optional URL elicitation. Pin supported `mcp`/Authlib versions after advisory audit; do not impose an arbitrary minimum release age that blocks security patches |
| 1.2 Empty MCP mount | `mcp/server.py`, registry, gateway, main lifespan; canonical path, protocol/Origin/Host checks, streamed body/depth cap, bounded thread/DB work, no-store and correct error boundaries; zero financial tools |
| 1.3 OAuth AS | Metadata, authorize/token/revoke, hardened CIMD, pre-registration CLI, session freshness, consent APIs/page, code/refresh lifecycle and key rotation. Advertise only implemented client-auth methods |
| 1.4 Schema | Ten security-design tables, nullable expense provenance/fingerprint, first-party original-authentication timestamp, necessary FK/unique/query/cleanup indexes; random-hex additive migrations, not a datastore replacement |
| 1.5 Policy/control | Principal/current-grant checks, DB kill switches and operator CLI, account/client suspension, logout-all/password/takeover revocation with documented lock ordering |
| 1.6 Quotas/operations/audit | Weighted atomic counters, immutable drafts and permanent minimal tombstones, approval revision binding, redacted audit, bounded cleanup/CLI, no stale-processing worker leases |
| 1.7 Financial service extraction | `ExpenseWriteService`, transaction-owning wrappers, flush-only helpers, category-memory/tag savepoint handling, personal-write user lock across REST/chat/recurring/import/edit/delete paths; inventory every writer before claiming coverage |
| 1.8 Read foundations | Catalog manifest and ambiguity behavior; DB query/detail adapters; Decimal aggregate-only personal services, currency-separated outputs, personal merchant path, bounded items, required composite indexes |
| 1.9 User rights and tests | Export/deletion coverage for existing phase data; new Postgres CI job/required check; update PG runner selection; previous-schema upgrade/downgrade tests; no application auth overrides hiding OAuth/approval checks |

**Exit:** empty-registry OAuth round trip works with the first target client; second target results and any compatibility blockers are recorded. Origin/protocol/auth lifecycle negative tests pass on the actual SDK. Transaction extraction preserves existing REST response contracts and gains atomic itemized writes. Focused tests, `scripts/quality/verify.sh --full`, relevant audits and routed implementation/test/security reviews pass. No open P0/P1 for phase scope. Keep MCP off in production.

### Phase 2 — Read-only release

Implement catalog, list, detail, summary and category breakdown. Personal only even when groups are enabled. Add read/disclosure quotas, bounded outputs, ambiguity/currency semantics, scope-aware tool lists and cross-user tests.

Ship consent, connection list/disconnect/suspend, **basic activity**, privacy disclosure, export and deletion before production read access. On mobile provide a discoverable link to browser management; native UI may follow later. Display real connection identity and safe provenance rather than trusting arbitrary client labels.

Test with Inspector locally and Claude app using a synthetic account, then ChatGPT. Record exact eligibility and versions. Production read enablement follows the deployment gates in §5; no write scope or write tool is advertised yet. Use a read-only pilot to measure capacity and user experience; elapsed time alone is not a success criterion.

**Exit:** SDK and required-client flows work; no group data in any response; raw disclosure is accounted across list/detail/status-style outputs; representative query/load tests fit the agreed deployment budget; user rights and disconnect work end to end. Basic activity is visible to the user, not just in DB rows.

### Phase 3 — Simple expenses with mandatory browser approval

| Task | Work |
|---|---|
| 3.1 Verify | `kind=simple`, exact preview, historical dates, pending draft, stable idempotency, duplicate candidates; no financial side effects |
| 3.2 Approve/reject | First-party APIs + responsive `/ai/approve/:id`; payload/revision-bound acknowledgement, fresh user auth, expiry and repeated-click behavior; approval itself does not save |
| 3.3 Save/status | Operation-ID-only execution, current authorization gate, per-user/operation locks, duplicate recheck/reapproval, create counters and audit in the financial transaction, reliable replay |
| 3.4 Manage/observe | Pending and approved-but-not-saved states, reject/disconnect, post-save status, web/mobile “Added by” label, browser management link, `refreshExpenseViews` when first-party UI observes commit |
| 3.5 Enable | After synthetic-account interop, fault/concurrency tests and reviews, enable create scope and tools for the pilot. Every expense still requires approval; no threshold/automatic mode |

**Exit:** bypassing verify, skipping approval, injecting an approval flag, using another connection's operation, changing a draft, saving after expiry/revocation and replaying an old key cannot create an expense. Concurrent different-key saves and MCP/REST races return renewed approval when needed. Every committed expense has one attributable operation and success audit. Both clients render provenance and can reach management.

### Phase 4 — Historical/itemized receipts

Expand `verify_expense` with the itemized discriminator; do not add a direct receipt-save tool. Preserve all items in preview, including real one-item receipts. Document net lines/item discounts/header subtotal; mismatches require explicit warning acknowledgement, never auto-correction.

Widen `expense_items.quantity` to Numeric(12,3) using a separately reviewed random-hex migration before exposing three-decimal quantities. Measure locks/table rewrite and prior-code compatibility; test precision-preserving upgrade and refuse lossy downgrade. Existing headers remain Decimal.

Add deterministic `parse_receipt_text` returning partial drafts/missing fields; spy on outbound model/network calls as well as quota state. Verification accepts older receipts, compares currency/date-independent content + date window, and save repeats checks against prior REST/CSV/chat/recurring and MCP expenses.

REST typed-header hardening is a separate compatibility-reviewed change: do not silently apply MCP-only USD/date/field restrictions to existing clients. Shared reconciliation and transaction fixes must retain existing contracts. Phase 4 exit requires receipt math/quantity round-trip, interruption/replay and concurrent duplicate tests on Postgres, plus first-party regression and mobile/web approval checks.

### Phase 5 — Separately scoped extensions

Personal budgets/recurring reads, native connection/approval screens, richer activity/anomaly detection and larger bounded import workflows can be designed here. User rights, basic activity and provenance are already shipped. Group reads/writes and expense update/delete remain separate product/security decisions; existing group services do not eliminate membership/split/notification/approval requirements. No automatic-write mode is authorized by this plan.

## 3. Verification matrix

### 3.1 Authentication, OAuth and transport

- Exact `/mcp` mount, lifespan, pinned-version metadata/headers/content negotiation; rejected header/body mismatch, invalid Origin/Host, unsupported version, malformed/deep/oversize/chunked/compressed inputs.
- No token, bad signature/algorithm/type/issuer/audience, expired/future-issued token; first-party JWT at MCP and MCP JWT at every first-party consent/approval/management route. Use real middleware/dependencies, no global auth bypass.
- Revocation, scope reduction, blocked client, suspended user, write pause, global stop, same-second cutoff and reconnect. Old grants/approvals do not revive.
- PKCE missing/plain/wrong; redirect/resource mismatch; unissuable scope; exact metadata behavior; client-auth method actually advertised/implemented; first-party request ownership, single consumption, stale login, CSRF and Google/password return navigation.
- Code redemption concurrency, valid-proof reuse and wrong-verifier non-revocation; atomic refresh rotation, absolute/idle expiry, client binding, concurrent refresh and reuse invalidating access tokens/approvals.
- RFC 7009 actual-token request, invalid-token response, binding and cookie independence. Logout-all/reset/change/takeover disconnect agents; ordinary logout does not.
- CIMD non-public IPs including IPv4-mapped IPv6, rebind, redirect, TLS/SNI, size/time limit, hostile logo/JWKS links, client_id mismatch and cache expiry. Assert no forbidden connection is made.

### 3.2 Ownership, data and output correctness

- Parametrize every registered tool over cross-user and cross-connection cases; malformed/foreign/group IDs return indistinguishable outcomes. Cursor filters/sort/user binding and deterministic tie-breaking.
- Distinct group/personal amounts prove no group shares or merchant text reaches v1 summaries, even with group features on.
- Existing non-USD rows remain separate; exact Decimal totals/category/month/merchant reconciliation; no floating-point sum path; legacy unknown currencies get explicit validation/warnings rather than USD relabelling.
- Ambiguous Other/Services/Electronics return null IDs consistently; ambiguous full-path filters fail; unique catalog paths work; catalog IDs remain stable on label changes.
- SQL pagination, maximum legacy items, real one-item receipt visibility, correct source attribution; notes only in detail; currency and aggregate bucket limits; maximum serialized response sizes. Set concrete per-tool budgets during Phase 1, with at most 25 KiB for a 50-row expense page and bounded paginated receipt detail.
- Historical date before account creation/older than three years accepted; malformed and too-future dates rejected; query windows independently capped; comparison current/previous both like-for-like.
- SDK-decoded dictionary decimal-string inputs, boolean/exponent/NaN/numeric rejection; all success/pending/error/terminal variants conform to schema.

### 3.3 Approval, idempotency and concurrency (Postgres mandatory)

- Verify authenticates and stores only draft+audit; save without verification or approval cannot write. Browser GET cannot approve; MCP cannot approve; forged `approved`/payload inputs rejected.
- Approved-but-not-saved UX, expired/rejected operation, stale revision, warning acknowledgement, immutable payload, changed draft requiring a new key; approval POST never creates an expense.
- Same verification key concurrency → one operation; changed payload → conflict; replay at every terminal state and after payload pruning.
- Same-operation parallel saves → exactly one expense/success audit/quota increment. Different approved drafts for the same expense → first commits, next returns pending reapproval.
- MCP versus first-party create/edit/delete/recurring races; existing null-fingerprint records; ±1-day match; different currency not duplicate; informed legitimate duplicate override.
- Save versus disconnect/suspend/logout-all/block/kill-switch races obey documented lock order; bounded lock waits/deadlock handling. Re-enabling writes never restores old approval authority.
- Quota concurrency across two app instances; weighted disclosure and create quota boundary tests; general retries count, create replays do not; user budgets survive reconnect.

### 3.4 Failure, retention and privacy

- Fail after header, items, memory, tags, audit and quota reservation: no partial expense or committed operation. Prove no nested commit/outer rollback in shared helpers. Save retry uses the same operation.
- Kill process/connection before commit and simulate lost response after commit; status/replay agrees with persisted expense. No fabricated stale-processing records or timeout-based worker takeover.
- Callback failure after commit does not change save result; authoritative summary immediately includes the expense. Do not reuse a closed request session in callbacks.
- Original/edited/deleted/converted expense on replay; tombstones never recreate deleted data; full payload pruning preserves key reservation and removes receipt text.
- Full account export/deletion for every new user-associated record, including OAuth requests/codes, counters and provenance; no credential hashes/material in export. Cleanup batch bounds and idle-installation CLI.
- Audit/error/log redaction; bounded unauthenticated denials; hostile text treated as data; no LLM/network invocation from expense verification/save/parser.

### 3.5 Existing clients, UI and CI

Backend unit tests use SQLite for portable logic; concurrency, Numeric precision, row locks/upserts and migrations require real Postgres. Add a GitHub Actions Postgres service job with `E2E_DATABASE_URL`, schema/extensions setup and explicit discovery of all MCP PG tests; require that check in release evidence. Update `run_e2e_pg_tests.sh`, which currently hard-codes three test files. A plain `unit.yml` pytest run without Postgres must not count as concurrency evidence.

Migration tests start at the preceding schema and exercise actual Alembic upgrade/downgrade, including new FKs/indexes/data backfill and compatibility with previous code. `Base.metadata.create_all` only tests fresh-model construction, not migrations; the repository's migration chain is not assumed to bootstrap from empty.

Preserve REST success/error shapes and side effects through behavior tests (snapshots supplement, not replace them). Run backend tests and both clients' lint/typecheck/Jest as applicable. UI RTL queries use roles/names and cover loading, no connections, denied scope, approval/expiry/reapproval, error/retry, mobile link and accessible focus/announcements. Browser tests use synthetic sessions without spending additional real auth-rate-limit budget in qa/.

Run `scripts/quality/verify.sh` during each code phase, full checks at phase gates and relevant dependency audits. Route implementation → product → test → security → accessibility → UX → performance reviews according to changed scope. No P0/P1 left open for enabled functionality. This documentation revision itself needs document consistency/link checks, not application test changes.

## 4. Audit disposition and traceability

“Addressed in design” means implementation and tests are still required. IDs below refer to the follow-up audit; original G1–G14 remain existing-product observations in the architecture review.

| Audit finding | Revised requirement / phase |
|---|---|
| A1 P1: hidden commits | Flush-only shared helpers; category-memory/tag failure tests; Phase 1/3 |
| A2 P1: different-key duplicates | Shared user lock, date-independent fingerprint/date window, all-writer coverage/legacy fallback; Phase 1/3 |
| A3 P1: contradictory recovery | Pre-existing approved operation + one save transaction, no processing lease, tombstone replay; Phase 1/3 |
| A4 P1: incomplete approval gate | Immutable revision, current grant/control checks, revocation lock ordering, duplicate reapproval; Phase 1/3 |
| A5 P1: OAuth/transport gaps | Actual-token revocation, truthful auth metadata, atomic refresh, Origin/version validation and complete lifecycle; Phase 1 |
| A6 P1: mixed summaries/currencies | Personal-only Decimal aggregate primitives and separate currency totals; Phase 1/2 |
| A7 P1: category ambiguity | Honest null IDs and rejected ambiguous filters; catalog manifest; Phase 1/2 |
| A8 P1: quantity precision | Numeric(12,3) migration and exact Postgres round trip; Phase 4 |
| A9 P1: delayed user rights | Export/deletion at each phase before production; Phase 1/2 onward |
| A10 P1: PG tests not gated | Runner discovery, PG CI/required check, actual migration tests; Phase 1 |
| A11 P2: strict parsing | Explicit decimal-string validators + actual SDK test; Phase 1/2/3 |
| A12 P2: quota/replay/disclosure | Separate request/new-draft/create budgets, cross-connection user disclosure accounting; Phase 1/2/3 |
| A13 P2: expensive summaries | Aggregate-only SQL, indexes, deadlines, EXPLAIN/load evidence; Phase 1/2 |
| A14 P2: lifecycle/schema omissions | Global control table, auth/approval fields, FK coverage, retention/cleanup CLI; Phase 1 |
| A15 P2: delayed visibility/parity | Basic activity at read launch; provenance/management link both clients with writes; Phase 2/3 |
| A16 P2: contradictory contracts | Real one-item receipts, actual source, detail notes, explicit periods and terminal states, accurate schema inventory; Phase 0–4 |

## 5. Deployment and rollback gates

- Record exact target app/account, SDK/Authlib versions and tested protocol behavior. Claude app is the first launch target; ChatGPT follows after its own evidence. Do not advertise other clients or subscription tiers without verification.
- Confirm least-privilege runtime IAM before remote metadata fetching, safe canonical URLs/Host/Origin handling, no-store/redacted OAuth logs, secret strength/key rotation, DCR off, explicit CIMD allowlist and production `/docs` disabled. Verify live infrastructure instead of treating older docs as proof.
- Run additive migrations before deployment with old-revision compatibility and bounded backfill. Quantity expansion has a separate tested rollout; disable receipt capability until complete. No destructive rollback or precision-losing downgrade.
- Ship secrets via Secret Manager and document rotation/revision behavior. Configure mount/write flags and DB kill switches, operator CLI, observability and cleanup runbook. Apply fail-closed controls consistently to legacy/direct Cloud Run host access.
- Read launch requires privacy text, consent, management/basic activity and export/deletion. Write launch additionally requires browser approval, both-client provenance, synthetic client flow and all concurrency/fault gates.
- Measure REST+MCP contention, DB connection/worker ceilings, request deadlines, query plans and quota/audit write amplification. No unsupported $0-cost or fixed-small-duration promise.
- Rollback by DB write stop or global stop first; audit it, invalidate old approvals via control generation, and preserve committed records/tombstones. Roll back code only to a schema-compatible revision. Re-enablement cannot save an old approval without renewed review.

## 6. Remaining evidence to obtain (not unanswered product decisions)

1. Exact Claude app surface/OS/account and ChatGPT surface/account used for acceptance, callback metadata and registration/refresh requirements.
2. Whether Authlib plus the pinned SDK meets those requirements; if not, present a concrete AS/registration alternative before expanding implementation.
3. Actual production IAM/ingress/pool constraints and migration lock budget; capacity measurements and observability ownership.
4. Privacy wording/backup-retention confirmation and operational cleanup/alert runbook before publishing.
5. Any requested exception to the initial 24-hour expiry or request/create limits, based on real historical-import use. Such changes cannot bypass approval or introduce unbounded bulk writes.

There is no outstanding product-approval question about browser approval, personal-only scope, historical receipts or logout-all behavior. Local implementation now covers the v1 behavior; real-client compatibility, staging capacity/migration evidence and production operations remain release gates.
