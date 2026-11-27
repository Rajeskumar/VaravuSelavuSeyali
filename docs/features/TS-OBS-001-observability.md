# TS-OBS-001 — Observability and 1,000-user backend capacity

2026-11-27. **Planned; not implemented, tested under load, or deployed.**

Outcome: diagnose API/component/client performance with the existing GCP stack, prevent sensitive
data in operational output, and demonstrate capacity for 1,000 daily active users. Owner intends
minimum one warm backend instance; scale-out/replacement cold starts still require measurement.

The plan's workload assumption is 60,000 requests/day, 20 RPS busiest-period load, 50 RPS headroom,
and a bounded 100 RPS burst. These are qualification targets, not observed capacity. Log
sanitization is mandatory and precedes richer instrumentation; it covers backend, clients,
SDK/error/access logging, development tools, scripts and platform sink behavior.

- [Requirements and scope](../sdlc/work-items/TS-OBS-001/requirements.md)
- [Implementation order, telemetry/consent/API contracts, load profiles and rollback](../sdlc/work-items/TS-OBS-001/implementation.md)
- [Logging inventory and existing-state evidence](../sdlc/work-items/TS-OBS-001/audit.md)
- [Acceptance test specification](../sdlc/work-items/TS-OBS-001/test-plan.md)
- [Proposed architecture decision](../decisions/0002-minimal-observability.md)

No new database schema, session replay, production stress test, paid APM service or unrestricted
payload tracing. Client performance collection is proposed as an independent opt-in and does not
reuse old analytics/crash permission. Implementation/cloud activation require their own authorization.
