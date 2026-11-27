# TS-OBS-001 — Source and operational audit

2026-11-27. Read-only audit; findings below are **not fixed**. Source references are repository-relative
and identify inspected code, not proof of deployed behavior. No customer log bodies were retrieved.
The worktree already contained unrelated changes; this item does not modify them.

## Evidence and limits

The earlier read-only GCP inspection in this chat queried Cloud Run v1/v2 configuration, Monitoring
alertPolicies/uptimeCheckConfigs/dashboards/timeSeries, and Logging metrics for the TrackSpense
project. It returned no alert policies, uptime checks, custom dashboards or log metrics. Backend:
1 vCPU/1 GiB, min 0/max 20, concurrency 80, timeout 300 s, request-based CPU allocation. The owner
subsequently intends min >=1; that change has not been reverified here. A warm instance is not
continuously allocated CPU and does not eliminate scale-out/restart latency.

Nov 20–27 request-count query returned ~3,500 requests, including 307×401 and 932×404, with no
5xx series. This includes mixed routes/statuses and excludes some pre-container failures; it is
not a clean customer SLI. Histogram aggregation gave container p95 bucket 2.29–2.52 s (3,523 samples),
network-entry-to-response p95 15.39–16.93 s and pending p95 15.39–16.93 s (3,417 samples each).
Different cohorts and bucketed percentiles cannot be subtracted. Cold starts/queueing are hypotheses,
not a proven root cause. No capacity test or production database inspection was performed.

## Logging inventory and closure requirements

Risk labels distinguish explicit payload output from potential exception/SDK exposure. Every row
needs Build disposition and a runtime test or documented provider boundary; a clean text search
alone cannot establish absence of leakage.

| ID | Surface / source | Observed behavior and risk | Required closure |
|---|---|---|---|
| L01 | `services/ai_quota_service.py:248` | Explicit user email with usage/cost | Remove identity, retain feature/provider/aggregate usage |
| L02 | `services/chat_service.py:1358,1384` | INFO agent node output; raw error extra | Remove message/tool dumps; safe event/category/frame output |
| L03 | `services/chat_service.py:1418,1437,1465` | Provider response text/URL or exception in extras | Allowlist provider/status only; formatter must not surface dormant extras |
| L04 | `services/insights_aggregation_service.py:460,472` | Item/merchant name plus email on error | Generic component failure without entity or identity |
| L05 | `services/entity_resolution_service.py:238,291` | Entity IDs/raw key | Drop IDs/name; retain entity-type/fallback category |
| L06 | `services/activity_service.py:59`, `notification_service.py:133`, `api/routes.py:1342,1503` | Group/template IDs and exception text | Safe event/category; no business IDs or interpolated exception |
| L07 | `services/email_service.py:110,173` | Full MIME output when local SMTP unconfigured, including token-bearing links | Loopback SMTP test inbox; no body/subject/link stdout, including local |
| L08 | `email_service.py:112,175`; `auth/routers.py:47,61` | Dynamic subject outside local; masked address plus raw exception | No subject/address; generic delivery outcome and safe frames |
| L09 | All `.exception`, `exc_info=True`, `%s` exceptions | Plain formatter can emit DB parameters/provider errors; SQLAlchemy errors may carry statements/values | Source fixes plus final formatter; synthetic DB/provider/auth exceptions |
| L10 | `main.py:22`, router imports at module start | Plain-text logging configured after service imports; extra fields currently omitted | Install safe logging before imports; do not expose old extras by swapping to generic JSON formatter |
| L11 | `oauth/logging.py`, installed only with MCP enabled | Uvicorn filter removes only `/oauth/` query; other paths, values, IPs remain | Replace raw access output with normalized metadata globally; test MCP enabled/disabled and unknown URLs |
| L12 | Cloud Run request logs and sinks | URLs/IPs collected independently of application formatter; existing routes include business names | Inspect all sinks, exclude raw service request records from retained/exported logs; verify platform limits |
| L13 | `varavu_selavu_ui/nginx.conf`, Docker image defaults | No explicit access-log suppression in service config | Inspect effective `nginx -T` in isolated image, disable raw access output; handle request-bearing error streams |
| L14 | Web `ErrorBoundary.tsx:27`, `AIAnalystChat.tsx:73` | Raw errors/component stack to browser console | Safe event/type/frame output; test object/message cannot escape |
| L15 | Mobile `core/logger.ts` and callers | Production silent; dev emits Error name/message, removes URLs but not arbitrary PII/secrets | Static messages/categories, no arbitrary error message; preserve production silence |
| L16 | Mobile `core/analytics/crash.ts`, native Firebase | Existing separate opt-in, safe names/frames, no error messages in wrapper | Preserve/retest with payload sentinels; verify native fatal/rejection/symbolication on both OSes, not just Jest |
| L17 | Web/mobile analytics validators/providers | Closed event enums and consent already exist; new performance channel must not bypass them | Preserve schemas/consent; separate operational schema and independent grant |
| L18 | Backend `scripts/backfill_entity_resolution.py:44,66`, `eval_categorize.py:69,72`, `eval_receipts.py:161,174` | Raw names/descriptions/filenames/exceptions in operator/evaluation output | Aggregate-only default output; synthetic fixtures; sanitize exception path and report artifacts |
| L19 | Backend `scripts/ai_access.py:68–127`, `seed_demo.py:235` | Email/account details printed by admin/seeding tools | Remove identities from default diagnostic output; protected explicit data retrieval is separate |
| L20 | SDK loggers: SQLAlchemy/psycopg2, httpx/requests, LangChain/provider SDKs, SMTP, MCP/Authlib, OCR | Inherited handlers/debug behavior may bypass application event calls | Inventory effective handlers/debug flags; suppress unsafe messages and format safe frames at every sink |
| L21 | `qa/scripts/provision_qa_session_user.py:61`, `verify_qa_users.py:46`, `qa/e2e/setup/global.setup.ts:50,82,107`, `global.teardown.ts`; proxy/CI artifacts | Explicit QA persona emails/raw exceptions; potential URL/token/body capture in artifacts not runtime-audited | Safe persona labels/categories, sentinel artifact inspection, no HTTP dumps/live credentials; preserve protected secret handoff without echoing it to logs |
| L22 | Cloudflare/provider exports, historical GCP buckets | Not inspected in this source audit; app fixes do not rewrite historical/provider data | Record configuration/access/retention evidence and any residual boundary; no unauthorized purge |
| L23 | `scripts/backfill_insights.py:173–193` | Financial source/aggregate totals printed during operator reconciliation | Keep correctness checks; report pass/fail/counts without financial totals in general operational output |

Paths in L01–L11 are under `varavu_selavu_app/varavu_selavu_service/`. Machine-readable stdout used
for a guarded local token/credential handoff (QA reset-token helper, URL guard) is not automatically
a diagnostic log: inspect consumers, prevent echo/artifact capture and preserve the contract.
Do not break test setup by redacting credentials needed by the consuming process.
Script output is not assumed
to be cloud-ingested, and development-only output is not described as a production leak.
No raw logging call was found in the scanned local native receipt module source; still test native
SDK/device output. Existing privacy defenses are coverage to preserve, not evidence all sinks are safe.

## Other observations

- `db/session.py:16`: no explicit pool sizing, pre-ping enabled. One Uvicorn process in Dockerfile.
  Inventory alternate pools before calculating a complete connection ceiling.
- `api/routes.py:190–197`: static liveness/readiness; no dependency signal.
- `api/routes.py:327` and other saves: BackgroundTasks update insights after save; need separate
  failure/freshness measurement and a process-termination test.
- `services/personal_write_lock.py`: per-user row locking; single-account load is not representative.
- `core/limiter.py`: in-memory per-instance limits, proxy identity assumptions; do not forge headers
  or disable limits to get favorable load numbers.
- Web `index.tsx:20` calls `reportWebVitals()` with no callback. Helper still references FID.
  `ErrorBoundary.tsx` is console-only. Mobile producers report coarse AI/receipt/category duration
  buckets; this is not generalized numeric API latency. Client consent coverage is incomplete by design.
- `docs/INFRASTRUCTURE.md` differs from inspected min-instance/memory configuration. Product spec
  §15.10 calls logging structured, but source formatter is plain text. Correct planned/current labels.

## Sources for design assumptions

- [Cloud Run metric definitions](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z#run): route label empty; latency/coverage distinctions.
- [Minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances): warm baseline, restarts still possible.
- [Billing/CPU allocation](https://docs.cloud.google.com/run/docs/configuring/billing-settings): min instances and background CPU are separate.
- [Structured logging](https://docs.cloud.google.com/run/docs/logging): stdout and trace correlation.
- [Log-based metrics](https://docs.cloud.google.com/logging/docs/logs-based-metrics): exclusions and lack of retroactive metric population.
- [SQLAlchemy pools](https://docs.sqlalchemy.org/en/20/core/pooling.html): defaults and pool ceiling.
- [k6 arrival-rate allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/): generator capacity and dropped iterations.
- [Web Vitals](https://web.dev/articles/vitals): LCP/INP/CLS definitions and p75 targets.

These are design references; verify version-sensitive integration APIs/pricing during Build.
