# Requirement agreement — TS-GA4-001

Status: proposed; Phase 1 requested on 2026-11-24. Owner: Rajeshkumar Ganesan. AC text is canonical in work-item.json.

The user requested an audit and comprehensive GA4 web/product analytics design, explicitly ending Phase 1 with findings and a plan for approval. The attached request is the requirement source; [audit](../../../analytics/audit.md) records source findings and the provided historical report summary. Existing integration uses consent-gated gtag but lacks custom business events, safe URL context, environment isolation and active withdrawal.

Outcome: meaningful, consented web behavior and confirmed operation metrics without financial/personal payloads; normalized manual SPA tracking; reusable event definitions; deterministic and actual-provider verification; maintainable Admin/reporting documentation. AC-001–011 cover the proposed implementation. [Catalog](../../../analytics/event-catalog.md) lists every requested event's implementation/defer status and reporting semantics.

Scope decisions require approval: no application User-ID; browser-segment activation instead of unsupported lifetime-first milestone; password-only confirmed signup; dedicated app web stream in existing property preferred; strict route exclusion and basic opt-in. No backend pipeline, new provider/dependency, mobile/MCP instrumentation, cross-repository marketing edits, deployment, GA Admin mutation or deletion is authorized. See [plan decisions](../../../analytics/implementation-plan.md#recommended-decisions-for-approval).

Readiness must distinguish source audit, mock/unit evidence, real tag transport, Admin state and production reporting. Prior UAT evidence is reused for scenario design, not claimed as new verification. Empty/error/disabled/denied/stale-account/unknown-write states must preserve product functionality. Native parity is assessed at contract level only under the user's explicit web-only scope.
