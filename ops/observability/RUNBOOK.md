# TrackSpense Minimal Observability Runbook (TS-OBS-001)

## Envelopes & Privacy Contract
- **Log volume envelope**: `<= 5 GiB/month` operational app telemetry, `30-day` retention.
- **Custom series envelope**: `<= 5,000` active custom series (`<= 150` routes, `<= 8` components, `<= 20` client operations).
- **Privacy boundary**: All application stdout logs pass through `SafeJsonFormatter` (`core/observability/sanitizer.py`). Raw Cloud Run HTTP request logs for `varavu-selavu-backend` and `varavu-selavu-frontend` are excluded from retaining sinks via `ops/observability/sink-exclusions.json`.
- **Untrusted client metrics**: `trackspense_client_*` metrics are consent-limited and untrusted; never use them as proof of financial or server SLO truth.

## Alerts

### Readiness Probe Failure (`TS-ALT-01`) {#readiness-probe-failure}
- **Trigger**: 3 consecutive failed 5-minute `/api/v1/readyz` checks from `>= 2` regions.
- **Check**: Verify Cloud Run revision status, PostgreSQL/Supabase reachability, and connection pool saturation. `/api/v1/readyz` uses an isolated 1-connection pool with a `<= 1 s` deadline.

### Core Error Rate (`TS-ALT-02`) {#core-error-rate}
- **Trigger**: `>= 5` unexpected core failures AND `> 1%` error rate over 10 minutes.
- **Check**: Filter Cloud Logging by `jsonPayload.event="api_request_completed" AND jsonPayload.outcome="server_error"` and correlate by `request_id` and safe `error_type` + repository-relative `frames`.

### Core Latency (`TS-ALT-03`) {#core-latency}
- **Trigger**: Core API body-complete p95 `> 1000 ms` over 15 minutes (`>= 100` samples).
- **Check**: Compare `db_acquire_ms`, `db_query_ms`, `db_commit_ms` and Cloud Run pending/startup metrics to distinguish DB pool contention from cold starts or slow queries.

### DB & Background Failures (`TS-ALT-04`) {#db-and-background-failures}
- **Trigger**: `>= 3` `db_acquire` timeouts or `insights_aggregation` background task failures in 10 minutes.
- **Check**: Inspect pool sizing (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`) vs Cloud Run `max-instances` and run read-only reconciliation (`qa/load/verify_correctness.py` pattern).

### Memory Capacity (`TS-ALT-05`) {#memory-capacity}
- **Trigger**: Container memory utilization `> 85%` for 15 minutes.
- **Check**: Review concurrent OCR/PDF workloads and instance memory allocation before scaling concurrency.

## Rollback Toggles (Sanitization Always Stays On)
- Disable client diagnostics ingestion immediately: set `CLIENT_DIAGNOSTICS_ENABLED=false` (endpoint returns `404`; clients drop batches silently).
- Disable DB hook timing overhead without touching sanitization: set `OBSERVABILITY_DB_TIMING_ENABLED=false`.
- **Never** roll back to a pre-sanitization payload-logging build; if unavoidable, keep `sink-exclusions.json` active and record diagnostic loss until a sanitized revision is restored.
