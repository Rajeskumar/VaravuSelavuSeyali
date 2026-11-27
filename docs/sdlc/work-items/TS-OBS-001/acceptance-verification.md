# TS-OBS-001 — Acceptance Verification

Date: 2026-11-27 · Snapshot: `b109cc31a935e97dbe6199d35a6d139753ef04d0707b160783b1e3fb550a415f` · PR [#68](https://github.com/Rajeskumar/VaravuSelavuSeyali/pull/68)

| AC | Status (Local + CI) | Evidence & Remaining External Gates |
|---|---|---|
| AC-01 | Verified (local + CI) | All audit rows L01–L23 inventoried and closed in source or documented as explicit provider boundaries (`audit.md`, `logging_guard.py`, `logging-inventory`). |
| AC-02 | Verified (local + CI) | `SafeJsonFormatter`, `configure_logging` before imports, `extract_safe_frames` (<=40 frames, no snippets/locals/messages), `FALLBACK_LOG_LINE`, `DEBUG=true` redaction, sentinel suite (`privacy-red-green`, `test_observability.py`). |
| AC-03 | Partial — cloud pending | `nginx.conf` updated (`access_log off; error_log /dev/stderr crit;`), service-scoped `ops/observability/sink-exclusions.json` validated dry-run; live GCP sink apply & sentinel check (`platform-log-privacy`) require separate cloud authorization. |
| AC-04 | Verified (local + CI) | Pure ASGI `ObservabilityMiddleware` times through body-complete, mints server UUID4 `X-Request-ID`, exposes via CORS, normalizes routes, isolates ContextVars (`server-observability`). |
| AC-05 | Verified (local + CI) | SQLAlchemy `db_instrumentation.py` measures checkout/execution/commit without SQL text; toggleable via `OBSERVABILITY_DB_TIMING_ENABLED` (`server-observability`, `postgres-integration`). |
| AC-06 | Partial — load pending | `/api/v1/healthz` independent, `/api/v1/readyz` bounded <=1s isolated 1-conn pool, `schedule_background_task` tracks outcomes (`server-observability`); 60s under-load reconciliation (`background-freshness`) awaits authorized staging load run. |
| AC-07 | Partial — cloud pending | Declarative `metrics.json`, `dashboard.json`, `alerts.json`, `RUNBOOK.md`, and `apply.py` dry-run pass (`OBS-12`); live GCP Monitoring alert delivery/resolution (`monitoring-acceptance`) awaits separate cloud authorization. |
| AC-08 | Verified (local + CI) | `POST /api/v1/telemetry/batch` default-off (`404`), cookie+CSRF & Bearer auth (`401`/`403`), 8 KiB pre-parse cap (`413`), strict closed schema / no NaN / no unknown keys (`400`), 6/min rate limit (`429`), `204` valid without logging principal (`server-observability`). |
| AC-09 | Partial — device pending | Independent default-off **Performance diagnostics** consent & clients on web and mobile pass unit tests (`client-privacy-parity`) and Playwright axe scan; lifecycle wiring (`F-IMP-1`) and physical iOS/Android QA-build network capture (`client-browser-native`) remain before enabling flag. |
| AC-10 | Verified (local) | `qa/load/target_guard.py` fails closed on prod hosts, missing allowlist/marker, unauthorized non-local targets, SQLite, and prod redirects (`load-isolation`). |
| AC-11 | Pending staging | `qa/load/scenarios.js`, `seed_fixtures.py`, `verify_correctness.py` built and unit-tested; 20/50 RPS staging qualification (`load-capacity`) requires separate authorization. |
| AC-12 | Pending staging | Spike/stress/soak/startup scenarios defined in `qa/load/scenarios.js`; staging execution (`load-capacity`) requires separate authorization. |
| AC-13 | Pending staging | Cardinality/volume envelopes (`<=5 GiB/month`, `<=5,000` series) enforced by `ops/observability/apply.py`; paired 20 RPS overhead measurement (`telemetry-overhead`) awaits authorized staging run. |
| AC-14 | Partial — release pending | Flag-off rollback (`CLIENT_DIAGNOSTICS_ENABLED=false`, `OBSERVABILITY_DB_TIMING_ENABLED=false`) verified while sanitization stays on (`OBS-27`); full `release-readiness` and Maestro native E2E remain before release. |

## What Was Not Tested
- Live GCP Cloud Logging sink exclusions, Cloud Monitoring dashboard/alerts, or Cloudflare log exports (cloud mutations prohibited without separate authorization).
- Non-local / staging k6 20/50/100 RPS load qualification and paired telemetry overhead runs.
- Physical iOS/Android QA-build network privacy capture and Maestro E2E on commit `4968934` + local fix.
