# ADR 0002 — Minimal observability with safe logs and measured capacity

Date: 2026-11-27. Status: **proposed**, implementation not authorized. Work item: TS-OBS-001.

## Context

TrackSpense is a Cloud Run FastAPI service plus web/native clients and Supabase PostgreSQL. The
owner wants a small operational design for 1,000 daily active users and explicitly requires log
sanitization everywhere. Existing GA4 answers usage questions; Crashlytics covers consented mobile
crashes. Neither supplies complete route/component latency. Audit identified unsafe logging and
large pending-latency tails; neither capacity nor their root cause is proven.

## Proposed decision

Reuse Cloud Logging and Monitoring. Sanitize at sources and final output before adding typed,
normalized request/component summaries, selected log-based metrics, one dashboard and a few
alerts. Treat platform/access logs separately. Use bounded authenticated client ingestion with
independent performance consent. Keep GA4/Crashlytics semantics. Load-test in isolated staging
with k6 and synthetic PostgreSQL data at 20 RPS expected/50 RPS headroom, plus bounded bursts.
Owner intends minimum one backend instance; verify rather than assume applied. This mitigates
scale-from-zero, not all cold starts, and does not imply idle CPU availability.

## Alternatives and consequences

- Native metrics alone omit route/component attribution and client outcomes.
- Full OpenTelemetry/APM now adds exporter/runtime/cost complexity; defer until summaries cannot
  answer repeated diagnostic questions. Preserve compatible operation naming and correlation.
- Self-hosted Prometheus/Grafana adds an operational service without demonstrated need.
- Firebase Performance would add another collection/privacy surface; defer its evaluation
  (TS-GA4-004 remains backlog). Existing crash reporting is preserved.
- First-party client ingestion requires validation/auth/rate limits. Scope v1 to signed-in
  journeys and explicitly acknowledge missing anonymous/consent-denied coverage.
- Excluding unsafe platform log streams trades raw request forensic detail for privacy; retain
  native metrics, safe events and independent probes, and verify every controlled sink.
- Runtime metrics/sanitizers must fail safely and not change financial semantics. No schema change.

The [implementation plan](../sdlc/work-items/TS-OBS-001/implementation.md) owns contracts, numeric
budgets and rollout; [audit](../sdlc/work-items/TS-OBS-001/audit.md) owns evidence and source inventory.
Accept/supersede this ADR only with the concrete plan decision; do not mark the product implemented.
