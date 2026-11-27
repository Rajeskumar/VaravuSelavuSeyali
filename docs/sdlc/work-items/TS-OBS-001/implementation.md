# TS-OBS-001 — Implementation plan

2026-11-27. Proposed; **no implementation or deployment authorized/performed**.
[Requirements](requirements.md) · [Audit](audit.md) · [Tests](test-plan.md) ·
[ADR 0002](../../../decisions/0002-minimal-observability.md).
Priority proposal P1, size L. High risk: privacy, error handling, endpoint, consent and operations.
Routing intended paths selected implementation/security/UI/product review, performance focus and
native evidence. Codex applies reviews inline after checks; no claim of independent review.

## 1. Architecture and affected areas

Reuse Cloud Run native metrics. Emit typed JSON summaries to stdout → Cloud Logging → selected
log-based counters/distributions → Cloud Monitoring. No remote metrics call per request, collector,
Prometheus service or always-on tracing. Future tracing can reuse normalized operation names.

| Proposed location | Responsibility |
|---|---|
| Backend `core/observability/` | Safe events/formatter, frame-only exception serializer, context, ASGI timing |
| Backend `main.py`, `core/config.py`, `db/session.py`, services | Early logging configuration, DB/component/background instrumentation |
| Backend `api/telemetry.py` | Feature-flagged authenticated diagnostic ingestion |
| Web `src/analytics/diagnostics/` | Separate operational schema/provider/consent within existing telemetry boundary |
| Mobile `src/core/observability/`, app composition and feature wrappers | Reusable transport/consent, injected operation registry; preserve app → features → core |
| `ops/observability/` | Metric/dashboard/alert definitions, runbooks, service-scoped sink changes, dry-run/apply separation |
| `qa/load/` | k6 scenarios, destination guards, synthetic fixtures and correctness/capacity reports |
| `scripts/quality/` | Source logging guard and integration into existing checks |

No new tables/migration. Money/auth behavior remains unchanged. Owner operates minimum-instance
change; verify it before tests. Retain request-based CPU unless measured background correctness
requires a separately reviewed change. Instrument BackgroundTasks without introducing a queue.

## 2. Privacy boundary — implement first (AC-01–03)

Fix each source in audit.md. Enforce the contract again at final output for root, Uvicorn,
third-party handlers and worker threads. Configure before router/service imports, including
startup errors and Uvicorn-owned logging. Redaction is unconditional: DEBUG cannot re-enable data.

Allowed common fields: event/severity/service/environment, bounded validated revision, random
server request UUID, normalized route, method/status/outcome enums, monotonic duration, safe error
category and event-specific numeric counts. Drop unknown fields. Unknown third-party messages
become a fixed event with an allowlisted logger category/error type. Never serialize arbitrary
messages, objects/repr, locals, exception values/chains, SQL/parameters, bodies or headers.
Retain at most 40 safe frames (repository-relative module/function/line); exclude source snippets,
absolute paths, locals and exception messages. Sanitizer failure emits a fixed fallback, not an
exception into the business operation. Preserve severity and useful error categories.

Remove email/per-user cost associations, agent node dumps, entity names/raw keys/resource IDs,
provider response bodies/URLs, email bodies/subjects/links, raw exceptions, web console objects
and mobile dev error messages. Aggregate AI cost/tokens/provider/feature may remain without identity.

Development email testing uses a loopback-only SMTP inbox and synthetic data; no reset/verification
links in stdout. Admin/evaluation tools default to aggregate counts/safe outcomes, not rows/emails/
receipt filenames. Explicit protected operator data retrieval is separate from operational logs.
Preserve required guarded machine-to-machine credential output in QA helpers; prevent its echo,
shell tracing and report capture rather than breaking the consuming process. Remove financial
totals from general backfill diagnostics while retaining exact reconciliation assertions.
Add a source guard for new raw console/print/dynamic logger calls outside reviewed adapters;
behavioral sentinel tests, not regex alone, establish privacy.

### Platform logging

App formatters cannot sanitize Cloud Run request logs or Nginx URI/referrer logs. Inventory project
and inherited sinks, exports and Cloudflare logging. Proposed default: exclude raw Cloud Run
request logs for the two TrackSpense services from all retaining/export sinks, retain native
metrics and normalized app events. Disable Nginx raw access logs; exclude request-bearing frontend
error streams if safe normalization is unavailable. Preserve safe startup/system events and
native status metrics. No changes to unrelated services in the shared GCP project.

Sink exclusions affect destination retention/routing, not initial platform processing or existing
logs, and not other sinks. Custom log metrics can process excluded entries; filter metrics only
to safe-schema events. Verify all controlled sinks with synthetic URL/IP/query/body sentinels.
Record provider-controlled exceptions honestly. Assess historical exposure/access/retention
without downloading customer data; any purge/retention change requires explicit authorization.

## 3. Server measurements (AC-04–06)

Use pure ASGI timing through final response-body send, not only `call_next`/headers. Emit one
completion for success/error/cancellation where observable. Separate post-response failures from
HTTP outcomes. Process kills can lose events; native metrics/probes are independent coverage.
Propagate and reset context across sync thread workers/background tasks, avoiding cross-request IDs.

Generate UUIDs server-side, expose `X-Request-ID` through CORS and error responses. Never trust
arbitrary incoming IDs. Validate Cloud trace IDs before correlation. IDs are log fields, not metric
labels. Use registered FastAPI route templates; unknown URLs become `unmatched`. Operation classes:
`core_read`, `core_write`, `ai`, `receipt`, `auth`, `other`. Probes/ingestion excluded from user SLIs.

Measure actual DB connection acquisition (checkout through success/error, including connect and
pre-ping; do not label it pure queue wait), summed execution time and query count. Do not log SQL.
Separate commit/transaction timing where measured; overlapping durations are not additive wall time.
Add boundaries for OCR, LLM calls, categorization fallback and insight aggregation; log safe
SMTP/push outcomes. Finite component/outcome names only.

Task start/completion/failure events include task type and random originating request ID. These
cannot prove delivery after a process kill. In load tests verify synthetic expense → expected
aggregate with exact totals within 60 s. Failure triggers a follow-up for durable work/reconciliation,
not an unsupported claim that counters guarantee completion.

Keep `/api/v1/healthz` process-only. `/api/v1/readyz` performs a read-only DB probe with a dedicated
small connection budget and total <=1 s deadline (acquisition/query), returning generic 200/503.
Use driver timeouts and close/recycle failed connections; cancelling an await around blocking SQL
is insufficient. Use for external dependency health, not automatic restart on DB outage. No AI/SMTP
dependency in core readiness. Preserve existing response compatibility on success.

## 4. Metrics and operating objectives (AC-07, AC-13)

| Family | Type and labels | Purpose |
|---|---|---|
| `api_requests` | Counter: route/method/outcome | Rate and failures |
| `api_duration_ms` | Distribution: route/operation_class | p50/p95/p99 |
| `component_duration_ms` | Distribution: component/outcome | DB acquisition/execution, OCR, AI |
| `background_outcomes` | Counter: task_type/outcome | Started/completed/failed |
| `client_duration` | Distribution: operation/platform/unit | UI timings/vitals; never combine different units |
| `client_outcomes` | Counter: operation/platform/outcome | Failures/unknown writes/errors |

Environment/service are resource context. No user/group/request IDs, raw paths, free-text errors,
client version or arbitrary model strings as custom labels. Revision stays in logs/native resource
context. Initial caps: 150 routes, 8 component types, 20 client operations, 5,000 active custom
series. Reject unknown labels. Core duration buckets include 100/250/500/1,000/3,000 ms, with wider
slow-operation coverage. Dimensionless CLS uses separate bucket definition 0.01/0.05/0.1/0.25/0.5/1
(the client family may therefore require separate time/score metric descriptors).

One dashboard: core health, route latency, startup/pending, CPU/memory/instances/DB, background and
client outcomes, release markers. Native metrics cover some requests never entering the app;
external probes cover independent failure modes. Do not present missing data as healthy.

Core availability objective: 99.5% over 30 days, successful eligible core requests / eligible core
requests. Classify expected invalid input/auth/not-found/quota rejections explicitly; chart them
separately. Unexpected server 429/5xx/timeouts count bad. Test auth regressions so blanket 4xx
exclusion cannot hide broken valid-user access. Client-confirmed operations remain a separate,
consent-limited, untrusted indicator, never proof of financial success. AI/OCR not pooled with core.

Initial alert policy proposals:
- Readiness failures: 3 consecutive failed five-minute probes confirmed from >=2 regions.
- Core errors: >=5 unexpected failures AND >1% over 10 minutes; preserve isolated failures for
  follow-up, especially financial operations.
- Core latency: p95 >1 s over 15 min with >=100 observations. Quiet periods rely on probes.
- DB acquisition timeout or background aggregation failure: >=3 in 10 min.
- Memory >85% for 15 min: capacity warning, not symptom-free paging.

Alerts include owner/channel, revision, dashboard, sanitized query and runbook; verify delivery and
resolution. Add authenticated read-only synthetic checks only after separately approved synthetic
account provisioning. No production synthetic financial writes. Probe traffic can keep instances
warm and must be considered in cold-start experiments.

## 5. Client contract (AC-08–09)

Add independent **Performance diagnostics** opt-in, off by default, with proposed copy:
“Share technical timings and error categories to help improve reliability. Expense details,
messages and account identifiers are not included.” Use existing privacy UI patterns and a new
native storage key. Do not reinterpret Analytics or Crash reports grants. Withdrawal immediately
stops collection/discards queues even on storage failure; grant does not collect earlier events.

Web: current supported `web-vitals` API during Build, LCP/INP/CLS for eligible post-consent events,
dashboard-ready, save-confirmation, render/unhandled/chunk-load failure categories. Native: same
core journey and API outcomes; retain Crashlytics wrapper, no Firebase Performance SDK. Do not
duplicate crash reports. Use monotonic clocks; body receipt and rendered-ready are separate timings.
Keep transport budgets and no-write-replay behavior. Scope first-party ingestion to signed-in
journeys; no anonymous/pre-login buffering. Label this coverage limitation in dashboards.

Proposed `POST /api/v1/telemetry/batch`, disabled initially by `CLIENT_DIAGNOSTICS_ENABLED=false`:

```json
{"schema_version":1,"events":[{"name":"save_confirmed","operation":"personal_expense_create","platform":"web","duration_ms":420,"outcome":"confirmed","request_id":"00000000-0000-4000-8000-000000000001"}]}
```

Initial closed event table (shared semantics, not new GA4 events):

| Name | Permitted operation(s) | Outcome and measurement |
|---|---|---|
| `api_completed` | `expense_list`, `analysis`, `insight_list`, `group_detail`, `receipt_parse`, `ai_query` | `success`, `rejected`, `failed`, `timeout`, `network_error`, `cancelled`; `duration_ms` |
| `dashboard_ready` | `dashboard` | `success` or `failed`; `duration_ms` |
| `save_confirmed`, `save_failed`, `save_unknown` | `personal_expense_create`, `personal_expense_update`, `group_expense_create`, `group_expense_update`, `settlement_create` | Respectively `confirmed`, `rejected`, `unknown`; `duration_ms` |
| `web_vital` | `lcp`, `inp`, `cls` | `measured`; time operations use `duration_ms`, CLS uses `value` and `unit=score`; web only |
| `client_error` | `render`, `chunk_load`, `unhandled_rejection` | `failed`; optional safe error type, no duration/body/message |

This is 18 operation names. Platforms are `web`, `ios`, `android`; error type is one of
`Error`, `TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `RequestError`, `other`.
Server request UUID is optional only for API/save events. Optional `build` matches
`^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$` and remains a log field. Reject incompatible name/operation/
outcome/platform/measurement combinations. Bounded frames belong in the existing sanitized crash
channel, not this endpoint. A write with a timeout/network/5xx ambiguous result emits `save_unknown`,
not `save_failed`; a deliberate read cancellation is not an availability failure.

- Existing cookie/Bearer auth and cookie CSRF. Derive identity for authorization/rate limiting
  only, never log it. No client identity fields, raw routes or error text.
- Event-specific closed schemas: event/operation/platform/outcome enums, optional UUID from
  server, finite duration 0–300,000 ms, CLS 0–10, bounded build ID. CLS uses `value`/`unit=score`;
  time events use `duration_ms`. Unknown fields reject the batch without echoing values.
- Max 8 KiB before parsing, 1–10 events, 6 batches/minute/authenticated principal/instance.
  Existing limiter is not global; document scaling cost. Client max 60 events/session and one
  flush/minute. Feature flag, max instances and bounded payloads limit ingestion amplification.
- Responses: 204 accepted, 400 invalid, 401 no auth, 403 CSRF, 413 oversized, 429 limited, 404
  disabled. Generic errors; no payload logging, no DB rows or user-data export changes.
- Transport calls only approved API host, excludes itself from instrumentation, never triggers
  auth refresh/retry and drops failures. No durable queue. Clear on logout/account/consent change;
  late prior-session operations cannot emit in a new session. Never block a business operation.
- Old clients unchanged; new clients tolerate disabled ingestion. Client-supplied data is untrusted
  and must never become server SLO/financial-success evidence.

## 6. Load and correctness specification (AC-10–12)

60,000 requests/day; busiest 600 s carries 12,000 = **20 RPS**. Start with 70% reads, 20% personal
writes, 10% group operations; freeze route weights after inspecting actual client fan-out. Use k6
arrival-rate scenarios and report offered/achieved HTTP RPS, not just iteration rate. Multi-request
journeys count their actual requests. Separate cookie+CSRF and Bearer cohorts.

| Scenario | Offered HTTP rate / duration | Gate |
|---|---|---|
| Smoke | One user, each journey | Auth/contracts/exact money assertions |
| Warm expected | 20 RPS, 30 min | Core p95 <=1 s, p99 <=3 s; unexpected errors <0.5% |
| Headroom | 50 RPS, 30 min | Same budgets, no pool timeout/OOM |
| Spike/recovery | 20 →100 RPS for 2 min →20 for 10 min | No corruption; baseline restored <=5 min; report transient failures |
| Bounded stress | 20/50/75/100 RPS, 5 min each | Find capacity knee; do not promise all stages pass |
| Soak | 20 RPS, 2 h | Core budgets, no retained-memory/connection growth after warm-up |
| Startup | Cold isolated staging revision; min=1 warm; scale-out/replacement | Quantify latency, not “zero cold starts” |
| Faults | Delayed DB/provider, lost response, background failure | Correct fallback, alert, no financial replay |

A 20 RPS two-hour soak sends ~144,000 requests; budget fixture churn/storage and cleanup.
Synthetic fixture: 1,000 accounts (800×100, 180×1,000, 20×10,000 expenses), valid dates in the last
year; 2/5/20-member groups, itemized receipts, dense months, tags/filters. Verify Decimal/exact-cent
totals. Unique synthetic descriptions prevent intended duplicate detection collapsing unique
writes. Lease one account per concurrent journey; separately exercise shared-account/group locks.

Harness development uses dedicated local PostgreSQL. Cloud qualification uses isolated staging
Cloud Run + PostgreSQL/Supabase with matching schema/extensions/region and documented tier. Never
use SQLite for capacity claims or implicitly load `.env`. Preflight requires allowlisted service,
project, DB fingerprint and synthetic-run marker; reject production endpoints/DBs, redirects to
production and missing markers. Non-local seeding/load requires separate authorization.

Credentials stay in memory, never reports. Seed verified synthetic accounts; provision test
sessions with the existing isolated QA pattern or pace real logins within limits. Measure real
auth on ordinary calls and separately test login/refresh. Do not disable limits or forge client-IP
headers. IP-limited auth/OCR scenarios use low-rate cohorts and verified staging network identity.

Real local OCR: synthetic receipts at 0.2 then 1 RPS alongside core load, provisional OCR p95 <=10 s.
Stub AI providers at deterministic 1 s/5 s/timeout/failure for sustained tests, while keeping quota
behavior. Paid provider smoke is separately approved, <=20 calls; report observations without
claiming reliable p99. Core budgets must hold during the agreed mixed workload.

Connection budget = observed DB allowance minus admin/other-service/migration/rollout reserve.
Inventory all pools. Cap pools/max instances for that budget, including overlapping revisions
and scale overshoot. Source defaults imply 15 connections/process, potentially 300 at 20 instances
from that engine alone. Compare concurrency 10/20/40/80 only after connection limits are known,
changing one variable at a time. No auto-raising limits.

Hard stop: unexpected errors >5% for 60 s, core p99 >10 s for 60 s, DB >80% available connection
budget for 60 s, OOM, correctness failure, target mismatch, or approved spend/rate/duration ceiling.
Billing alerts are not hard spend caps. Verify generator CPU/network/VU capacity. Qualified runs
require zero dropped iterations; report provisioning failures separately from application failures.
No sustained cloud tests in normal PR CI; optional local smoke and explicitly authorized runs only.

## 7. Cost, rollout and recovery (AC-13–14)

Estimate actual bytes/event × events/request × volume plus custom series, probes and retention.
Separate steady usage, test traffic, min-instance hosting and AI costs. Illustration: 1 KiB/request
×60,000/day ≈1.8 GB/month before component/client/platform logs; this is not a price quote.
Propose 30-day operational retention, <=5,000 custom series, <=5 GiB/month app telemetry as initial
design envelopes. Confirm actual pricing/shared-project usage and owner budget before activation.
Bound repeated details and shed optional client/component detail before essential counters/privacy.

Deploy sanitization first. Verify staging output and all controlled sinks with sentinels, then
server summaries, metrics/alerts, load qualification, and client QA consent. Metrics do not backfill.
Production activation is a separately authorized release. Device tests use QA builds; existing
E2E builds intentionally disable Firebase. Verify iOS/Android network privacy and symbolication.

Rollback disables ingestion/client collection/optional timing independently while preserving safe
logging. Do not restore a payload-logging build; if unavoidable retain raw-log exclusions and
explicitly record diagnostic loss until a sanitized build is restored. No DB downgrade required.

## 8. Ordered tasks and evidence

- [ ] T1: Backend/client engineer — close audit logging rows, safe output boundary and source guard; services/scripts/web console/mobile logger. Evidence `privacy-red-green`, `logging-inventory`, `checks-fast`.
- [ ] T2: SRE/security engineer — service-scoped sink/Nginx changes and historical exposure assessment; explicit cloud authorization. Evidence `platform-log-privacy`.
- [ ] T3: Backend engineer — request/body correlation, DB/component/background timing and bounded readiness; after T1. Evidence `server-observability`, `postgres-integration`.
- [ ] T4: SRE — metric/dashboard/alert definitions, runbooks/cost estimate; after T2–T3. Evidence `monitoring-acceptance`, `telemetry-overhead`.
- [ ] T5: QA/performance engineer — guarded k6 fixtures and 20/50 RPS qualification, spike/soak/faults; after T3–T4. Evidence `load-capacity`, `load-isolation`, `background-freshness`.
- [ ] T6: Web/mobile engineer — independent consent, authenticated ingestion, shared operation semantics and vitals; after T1/T3 and approved contract. Evidence `client-privacy-parity`, `client-browser-native`.
- [ ] T7: QA/review — deterministic checks then routed code/security/UI/product reviews once; fix without weakening thresholds. Evidence `review-code`, `review-security`, `review-ui`, `review-product`, `acceptance-verification`.
- [ ] T8: Release owner — exact-candidate capacity/cost/config/rollback review; deploy only on authorization. Evidence `release-readiness`, separate release record.

Update CHANGELOG/ROADMAP/FEATURE_STATUS, product spec §15.10, architecture/infrastructure,
analytics/privacy and runbooks through planned → implemented → validated → deployed. No README
setup change until tooling exists. Plan completeness is not execution/performance/privacy evidence.
