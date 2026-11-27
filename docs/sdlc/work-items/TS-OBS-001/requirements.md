# TS-OBS-001 — Requirement agreement

2026-11-27. Phase: Plan. Status: proposed implementation plan; product direction agreed.
Acceptance criteria are authoritative in [work-item.json](work-item.json).

## Problem and outcome

TrackSpense has Cloud Run metrics and consented product analytics, but no configured operational
dashboard/alerts in the project inspected on 2026-11-27, no normalized per-route application timing,
and sensitive-data logging paths. Operators cannot reliably distinguish infrastructure waiting,
database work, OCR, AI calls, background aggregation or client failures.

Deliver minimal GCP-native observability, eliminate sensitive application logging across
backend/web/mobile/tooling, and establish measured capacity for **1,000 daily active users**.
See [audit](audit.md), [implementation](implementation.md), and [test specification](test-plan.md).

## Agreed direction and authorization

- Owner requested an implementation plan, increased the target from 100 to 1,000 daily users,
  explicitly required log sanitization and checking other locations, and intends to set the
  backend minimum instance count to at least one. Source: this chat, 2026-11-27.
- This authorizes planning artifacts, not implementation, deployment, provisioning, production
  load, production database access, or changes to log retention. Implementation approval is null.
- Minimum one instance is intended, not verified applied. It mitigates scale-from-zero latency;
  scale-out, revision replacement and restarts still need startup testing. Minimum instances do
  not imply continuously allocated CPU.
- Reuse Cloud Logging/Monitoring, GA4 and Crashlytics. No new paid APM vendor or self-hosted
  monitoring cluster. Estimate incremental cost from bytes/series; no monthly budget is approved.

## Scope

AC-01–03: logging inventory, source fixes, safe final logging boundaries, platform log-routing
verification. Include development, scripts, SDKs and exception paths, not just production messages.

AC-04–07: request correlation, route metrics, component timings, dependency health, background
outcomes, one dashboard and actionable alerts.

AC-08–09: web/native diagnostics for authenticated core journeys; independent performance consent,
off by default. Existing GA4/crash choices retain their meaning. No retrospective collection.

AC-10–12: isolated k6 tests with synthetic accounts/data, PostgreSQL, real auth/permissions/limits,
financial correctness, dependency faults and a capacity report.

AC-13–14: cost/overhead limits, rollback that preserves sanitization, and release evidence.

## Exclusions

No financial-rule redesign, schema migration, durable task queue, server-wide financial idempotency,
automatic retries of ambiguous writes, session replay, persistent user tracking, SQL/body/prompt
capture, always-on tracing or production stress tests. MCP logging is audited; enabling or load
certifying default-off MCP is out of scope. No historical-log purge is authorized.

## Proposed defaults

- 1,000 DAU × 2 sessions/day × 30 HTTP requests/session = 60,000 requests/day. Assume 20% in
  busiest 10 minutes: 20 RPS, with 50 RPS qualification headroom. DAU is not concurrent users.
- Ordinary API p95 <=1 s, p99 <=3 s including body completion, measured by a regional generator
  at the public staging endpoint; unexpected failure rate <0.5%. These are unproven targets.
- Core availability objective: 99.5% over 30 days. Invalid requests, health checks, ingestion,
  synthetic traffic and deliberate faults are separate cohorts. AI/OCR have separate budgets.
- Independent performance-diagnostics opt-in on both clients. Anonymous/pre-login first-party
  diagnostics are excluded from v1 to avoid a public ingestion service.

## Inputs required before execution

Before cloud load: record staging project/service/DB identifiers, DB connection allowance,
generator location, approved spend/rate ceiling and exact config. Harness refuses absent or
mismatched facts. Cloud writes and non-local seeding/load need authorization. Review a cost
estimate, notification destination and retention policy before production activation. These are
execution prerequisites, not a reason to leave this planning task unfinished.
