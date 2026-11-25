# Implementation plan — TS-GA4-001

Status: proposed, approval pending. Semantic risk high; priority P1; size L.

Architecture, route/config/consent/operation contracts, alternatives, risks, dependencies and rollback: [canonical analytics implementation plan](../../../analytics/implementation-plan.md). Privacy trust boundaries and threat cases: [privacy design](../../../analytics/privacy.md). Exact event schema/owners/UAT/report formulas: [catalog](../../../analytics/event-catalog.md). Admin and marketing coordination: [runbook](../../../analytics/ga4-configuration.md).

- [ ] T1: Approve decisions/fingerprint; mirror Ready; confirm stream strategy without production changes.
- [ ] T2: Engineer adds closed event schema, validators, provider/no-op/mock, config and consent compatibility shim; ANA-01/04/06/09/10.
- [ ] T3: Engineer adds public/Account preferences, withdrawal/reset and policy copy; ANA-04/06, UI/security review.
- [ ] T4: Engineer unifies routes/titles, committed navigation, redirect dedup and sensitive route containment; ANA-02/03/11.
- [ ] T5: Engineer instruments authoritative auth/expense/receipt/group/Ask outcomes; ANA-05/07/08 and catalog UAT.
- [ ] T6: Engineer adds recurring/analysis/filter/export events and verifies active callers/partial writes; ANA-05/08.
- [ ] T7: Engineer/QA adds fail-closed build inputs, safe QA fixtures and real-tag transport evidence; ANA-09/10/11, deterministic checks.
- [ ] T8: Inline code/security/product/UI review after checks; update docs/spec/status and acceptance evidence.
- [ ] T9: Owner-authorized operational rollout only; configure approved stream, verify both sites/reporting; ANA-12.

Affected code areas: web src/analytics (new), current analyticsConsent, App/RouteA11y, consent/preferences UI, API operation/context adapters and listed journey handlers; web Docker/build configuration; QA fixtures/payload tests. No native changes or DB migration proposed. Before edits read area AGENTS.md. Deployment/GA4 changes remain separately authorized; default off, disable collection to recover without reverting privacy controls. Do not emit or replay financial writes from analytics.

Test specification: test-plan.md; required evidence IDs in work-item.json. `make route` is documentation-only for this phase; implementation semantic routing includes code/security, UI for preferences, product for event/business rules, applied inline by Codex after checks. No reviewer evidence is claimed for Phase 1. Updates to linked plan contracts require refreshing the following digests before re-fingerprinting, so approval cannot silently refer to an older linked design.

## Referenced contract digests

- `audit.md`: `16fd39fc2bd8d41ebabefb0a9228f2a7016c7fe850bf25dbd5bfcd315df9a4ee`
- `event-catalog.md`: `311727f755327e8f987989922418bf20b9ad166ae677d94955b889e36ef07d5a`
- `implementation-plan.md`: `19878574dd674617264f1f9dfe2cf8d778f922c98f04ce00bdf055927e9d9de8`
- `ga4-configuration.md`: `551055e6f75e2f35637da1902810dd7f75f81d899cf74ed99a67b965c030bd00`
- `privacy.md`: `12f2bb36c576ae145f141f6540e8e052c058c203ca1b32380ad1ae179eb37d15`
