# TS-OBS-001 — Test specification

Proposed, not executed. AC text: [work-item.json](work-item.json). Targets/config:
[implementation.md](implementation.md). All payloads/credentials/fixtures below are synthetic.

## Scenarios

| ID | AC IDs | Preconditions / fixture | Action | Expected result | Level / location |
|---|---|---|---|---|---|
| OBS-01 | AC-01, AC-02 | Distinct sentinels for email/token/description/OCR/prompt/merchant/SQL parameter | Trigger each L01–L11/L18–L20 audit path, DEBUG on/off, local/production config | No sentinel in stdout/stderr/JSON/error frames; event/severity/category retained | Backend unit + subprocess integration |
| OBS-02 | AC-02 | Nested/chained DBAPI/HTTP exceptions, hostile repr/getters, formatter exception | Emit raw SDK/root/worker/import failures | No message, SQL, locals, body or secret; bounded fixed fallback, business request unaffected | Backend unit/subprocess |
| OBS-03 | AC-01, AC-02 | Static scan and deliberately unsafe new fixture call | Run logging guard; then safe adapter call | Unsafe call fails; reviewed safe events pass; no broad suppression | Quality tooling test |
| OBS-04 | AC-02, AC-03 | Unknown path, OAuth query, merchant name path, request header/IP sentinels; MCP on/off | Exercise isolated Uvicorn/nginx, then approved staging sink destinations | App/access output safe; raw platform records excluded in all controlled destinations; residual provider processing documented | Container + manual cloud evidence |
| OBS-05 | AC-02 | SMTP missing and local loopback test inbox; synthetic admin/eval data | Send verification/reset/invite, run operator tools | No email/body/subject/token stdout; test inbox still supports local workflow; aggregate-only reports | Script/service integration |
| OBS-06 | AC-04 | Concurrent success/4xx/5xx requests and injected hostile request ID | Invoke sync/async routes, malformed path, CORS error | Unique server IDs and normalized routes; one terminal event; no cross-request context | Backend integration |
| OBS-07 | AC-04, AC-06 | Stream/body delay, disconnect, post-response background exception | Read headers, delayed body; disconnect; fail background task | Timer includes final body, no double HTTP outcome, background failure separate | ASGI transport integration |
| OBS-08 | AC-05 | Dedicated local PG, pool exhaustion, slow SQL, commit, parallel queries | Exercise acquisition/execution/timeout | Correct categories/units, no SQL text, acquisition includes actual checkout, no fake summed wall time | PostgreSQL integration |
| OBS-09 | AC-05, AC-06 | DB/provider/OCR delays and failures, sanitizer/telemetry failure | Run core/receipt/chat/aggregation paths | Component attribution, existing quota/fallback semantics, no telemetry-induced business failure | Backend integration |
| OBS-10 | AC-06 | Local PG reachable then unavailable/connection stall | Call healthz and readyz | Liveness independent; readiness generic 200/503 within total 1 s, no leaked/unbounded DB connections | PG/fault integration |
| OBS-11 | AC-06, AC-11 | Synthetic committed expenses with exact expected aggregates | Read aggregates after save; terminate process around background task | Normal completion <=60 s; interruption truthfully detected by reconciliation, no false delivery claim | Local/staging fault + correctness |
| OBS-12 | AC-07 | Deterministic safe events, core/AI/probe/4xx cohorts | Evaluate metric filters/histograms/SLO classifications | Correct counts/buckets/units; probes/AI separate; valid-user auth regression detectable | Config tests + staging Monitoring |
| OBS-13 | AC-07 | Controlled repeated failures and subsequent recovery | Trigger each alert, include zero/low sample windows | Correct trigger/resolution and actual notification; no-data not green; links/runbook usable | Staging manual operational acceptance |
| OBS-14 | AC-08, AC-09 | Web/iOS/Android, no grant, old analytics/crash grants, withdrawal/persist failure | Start operations, grant/withdraw/change account/relaunch | No implicit grant, no retrospective replay, queues cleared, late results isolated | Client unit + browser/native network inspection |
| OBS-15 | AC-08 | Valid cookie+CSRF and Bearer, missing/expired auth, forged identity | POST valid/invalid batches | 204 valid; 401/403 invalid auth/CSRF; no body/identity logging or DB row | API auth integration |
| OBS-16 | AC-08 | Batches at byte/event/rate boundaries; NaN/Infinity, unknown keys/enums, oversized chunked body | Send boundary/hostile requests | Body bounded before parse; 400/413/429 generic; no reflected payload; bad events cannot alter SLOs | API negative/boundary |
| OBS-17 | AC-08, AC-09 | Endpoint disabled/offline/5xx/slow, expired session | Attempt flush during save and account change | Drop diagnostics, no recursive telemetry/refresh/retry, no blocked save or durable replay | Client transport tests |
| OBS-18 | AC-09 | Render/chunk/unhandled error with payload sentinels; mobile fatal/rejection | Exercise safe console/diagnostics/Crashlytics boundaries | No messages/PII, correct consent, preserved safe debugging frames and usable symbols | Web/browser + iOS/Android QA build |
| OBS-19 | AC-09 | Monotonic fake clock, partial body, delayed render and consent timing | Measure vitals/API/dashboard/save outcomes | One event per defined operation, accurate units; LCP/INP/CLS p75 split by device; no pre-consent buffering | Client unit/browser/device |
| OBS-20 | AC-10 | Local/prod-looking/missing-marker/redirect targets, wrong DB/project/env | Execute harness preflight without load | Reject unsafe/unknown targets before connection/write; explicit isolated approved target passes | Harness unit/integration |
| OBS-21 | AC-10, AC-11 | Verified synthetic fixtures, real auth/limits, one account per VU lease | Run smoke then 20/50 RPS qualification | Offered rate achieved, zero drops, p95 <=1 s/p99 <=3 s/errors <0.5%; auth/CSRF enforced | k6 staging |
| OBS-22 | AC-11 | Exact initial/post-run personal/group/receipt totals | Perform unique writes/settlements, lose response, revisit records | Acknowledged writes persist; splits reconcile; no automatic ambiguous replay or unintended duplicates | PG read-only post-run verifier |
| OBS-23 | AC-11, AC-12 | min=1 config, documented pool/max-instance budget | Run 100 RPS spike, bounded stress and 2 h soak | Stop rules enforced; recovery <=5 min; no pool/OOM/correctness failure in qualification; capacity knee reported honestly | k6 + Monitoring |
| OBS-24 | AC-12 | Isolated cold/replacement revision and warm min=1; 10/20/40/80 concurrency variants | Compare controlled cohorts | Measured startup/scaling contribution, config/revision attached; no assertion all cold starts removed | Staging experiment |
| OBS-25 | AC-11, AC-12 | Synthetic real OCR 0.2/1 RPS + provider stub 1/5 s/errors | Mix with core workload | Core budgets hold; OCR p95 <=10 s; quota/fallback correct; no paid AI in sustained load | k6 integration |
| OBS-26 | AC-13 | Same image/fixture/load with optional timing off/on; measured bytes/series | Three paired 20 RPS runs; estimate monthly telemetry | <=5% p95 increase and <=20 ms absolute increase (both), no correctness change; cardinality/volume envelope or explicit revision | Performance/FinOps report |
| OBS-27 | AC-14 | Previous compatible clients, disabled ingestion and optional instrumentation | Toggle rollback flags; verify logs again | Old/new clients operate; sanitization remains; no schema downgrade or payload-logging rollback | Release rehearsal |

## Required evidence and review order

`checks-fast`: scoped make check (backend/client unit, lint/types, secret/test-integrity, framework;
audits when manifests change), plus authoritative CI on candidate. `postgres-integration`: dedicated
local PostgreSQL for database/concurrency tests. `privacy-red-green`: suitable sentinel regressions
fail on existing source, pass after fixes. `logging-inventory`: every audit row disposition.
`platform-log-privacy`: effective config and controlled sink verification, not just app tests.
`server-observability`, `monitoring-acceptance`, `background-freshness`, `load-isolation`,
`load-capacity`, `telemetry-overhead`, `client-privacy-parity`, `client-browser-native` map to the
scenario groups above. `review-code`, `review-security`, `review-ui`, `review-product` follow passing
deterministic checks once per scope; `acceptance-verification` maps all ACs to current evidence.
`release-readiness` is an assessment, never deployment authorization.

Browser evidence includes keyboard/focus/accessible naming and consent states, desktop/mobile
viewports, dark mode. Native evidence includes both iOS/Android network capture with consent off/on,
withdrawal and error sanitization/symbolication; applicable local Maestro release journeys remain
required when mobile changes. The existing E2E variant disables Firebase, so it cannot establish
Crashlytics delivery. Reuse QA native configuration; do not repoint release apps to staging casually.

## Result artifact

Record candidate SHA/worktree snapshot, fixture seed/hash, generator region/resources, endpoint and
DB fingerprint (no credentials), instance/CPU/memory/concurrency/pool settings, limits, offered and
achieved RPS, checks/errors, per-route/cohort latency distributions, drops, stop reason, CPU/memory/
connections, correctness/freshness results, telemetry bytes/series, estimated cost and recovery.
Keep a sanitized compact summary in this work item; raw synthetic-only artifacts get bounded
retention. No auth headers, payloads, customer rows or full URLs in reports. Distinguish failed
qualification from intentionally discovered stress limits and incomplete external/device evidence.

No tests in this specification have been run. Plan-only validation is recorded separately;
empty execution ledgers must not be filled with hypothetical passes.
