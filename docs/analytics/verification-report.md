# Analytics verification report — Phase 1 only

2026-11-24 · TS-GA4-001 · Audited source `aa254b84c3f62d974cd9a594fbc5568841ef3208`.

**Implementation acceptance: INCOMPLETE_EVIDENCE.** No analytics implementation has been made. Phase 1 source findings are supported below; this is not a production privacy/compliance or release PASS.

## Executed

- Read-only source searches across web/backend/mobile, existing QA inventories/UAT and sibling marketing source. No application/marketing configuration or external data was changed. GA4 reports/settings were not accessed.
- Isolated Node VM harness transpiled the actual `src/utils/analyticsConsent.ts` with the installed TypeScript compiler, mocked DOM/localStorage/tag queue, and called `initAnalyticsFromStoredConsent` twice followed by `denyAnalyticsConsent`. No browser or network was used. Reproduction script for this session: `/tmp/trackspense-ga4-audit.cjs` (temporary, not a durable test suite).

| Harness input | Observed |
|---|---|
| Production, no stored choice | Zero scripts and zero tag commands. |
| Production, stored denied | Zero scripts and zero tag commands. |
| Production, stored granted, initialize twice | One script, one `js`, one `config`; no duplicate initializer. |
| Development, stored granted | Same production-ID script/config; environment isolation absent. |
| Test, stored granted | Same production-ID script/config; environment isolation absent. |
| Granted, `/ai/approve/synthetic` cold load | No script/config. This does not test an already loaded SDK navigating there. |
| Deny after granted initialization | No new tag command; disable flag remains unset. Storage denial alone cannot stop active SDK behavior. |
| Granted, missing `window.gtag` | Throws `w.gtag is not a function`. |
| Storage read throws | Error propagates. |

The harness establishes source behavior, not GA network payloads, historical contamination or actual duplicate page views. Expected gaps are audit findings, not newly passing requirements.

## Existing focused tests

Command (from `varavu_selavu_ui`):

```sh
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/common/ConsentBanner.test.tsx src/components/common/RouteA11y.test.tsx
```

Result: **2 suites, 4 tests passed** (1.277 seconds). Existing RouteA11y test emitted a React `act(...)` warning; Watchman reported a recrawl warning. Neither failed the run. These existing jsdom tests do not exercise a real Google tag or establish outbound privacy.

## Required before implementation acceptance

See [test specification](../sdlc/work-items/TS-GA4-001/test-plan.md) for ANA-01–12, fixtures and evidence IDs. Outstanding: failing-first regressions and fixed-source tests, schema/operation/consent lifecycle coverage, actual-tag GET/POST/beacon capture, Admin-state confirmation, marketing coordination, DebugView ingestion and reporting checks. Keep these as missing, never mark waived or passed because the plan exists.

No migration, database access, financial write, production deployment, GA Admin change, data deletion, filter activation, commit or push performed. The app remains at its original implementation.

## Phase 1 planning checks

- `make route BASE=HEAD`: 15 changed documentation/record files, trivial current patch, no reviewers, framework checks selected. Future implementation is explicitly high risk.
- `SDLC_PYTHON=.venv-sdlc/bin/python make check BASE=HEAD`: framework-check and test-integrity passed; rerun after final documentation corrections before recording current evidence.
- `.venv-sdlc/bin/python scripts/quality/sdlc.py validate`: eight records/templates valid.
- Plan gate: **PASS** (artifact completeness only). Build gate: **INCOMPLETE_EVIDENCE**, missing user implementation approval for the current fingerprint. No approval fabricated and no board write made.
- Local Markdown link target check: PASS. `git diff --check`: PASS.
- System `python3` initially lacked `jsonschema`; reran validation successfully using the existing `.venv-sdlc` interpreter. No package installation or environment change needed.

Approved implementation fingerprint is absent. Proposed fingerprint at Phase 1 completion:
`0ad8204f820d9d1988d73cf278841dbfb69b5067c9d637246d7866824d328016`.

Current planning-only check results are recorded as `phase1-*` in the work item's evidence ledger, with **no implementation AC marked verified**. Application tests, real outbound privacy, Admin state and reporting acceptance remain missing as listed above.

## Phase 2 foundation verification (2026-11-25)

The web foundation is implemented and collection is disabled by default. The original audit and Phase 1 results above describe the pre-change baseline. Current behavior and activation dependencies are in [foundation status](foundation-status.md).

Three regression tests failed against the old loader as expected. They reproduced production-tag injection during Jest and exceptions when preference storage refused reads or writes. They pass with the new adapter. Added cases cover schema rejection, exact destination configuration, operation deduplication, consent controls, Strict Mode navigation, redirects, resource normalization and back/forward.

The isolated Chromium fixture passed three scenarios covering sanitized GET/beacon payloads, withdrawal, sensitive forward navigation and disabled destination configuration. It exercises real application adapter code with a fixture tag and intercepts all requests. The optimized CRA build also compiled successfully with collection disabled. Neither run establishes the real SDK's automatic payloads, cookie behavior or Admin settings.

The work item's [validation record](../sdlc/work-items/TS-GA4-001/validation.md) records final checks and residual limits. Implementation acceptance remains **INCOMPLETE_EVIDENCE** for product producers, real Google-tag and DebugView verification, confirmed Admin configuration and reporting. No production collection or deployment was enabled.

## Phase 3 product instrumentation (2026-11-25)

The [producer implementation](product-events-status.md) covers the proposed web event families. The product tests exercise actual API adapters with stubbed transport. They verify delayed success acknowledgement, unknown writes without retries, duplicate receipt conflicts, canonical receipt/group creation, independent registration and sign-in outcomes, and recurring no-op handling. A form revision test verifies that shared suggestion requests discard stale responses. The existing Quick Capture regression covers double-click and unknown-outcome protection.

The web lint, TypeScript check and all 336 Jest tests passed after correcting the edit sheet's Hook ordering. The backend, QA typecheck, framework, secret scan and test-integrity checks passed in the same verification cycle. The three isolated Chromium cases also passed. The product payload fixture verifies one logical event produces the expected GET and beacon payloads, while a repeat operation and an event containing an extra identifier produce no requests.

Full acceptance remains **INCOMPLETE_EVIDENCE**. The isolated browser used a fixture tag. Actual SDK transport, DebugView, Admin settings and reporting on an approved non-production property are pending. GA4 collection defaults off. See the [validation record](../sdlc/work-items/TS-GA4-001/validation.md).

## Real Google tag test on local HTTPS (2026-11-25)

Used a temporary, optimized build on `https://localhost:9443` with the owner-supplied test stream `G-LCDPWZ61JR`. The local API responses came from deterministic browser fixtures. The tracked workspace keeps the approved destination registry empty.

The first real-SDK capture reproduced two initial page views despite `send_page_view: false` in the destination configuration. Setting it before tag bootstrap removed the extra view. Explicit event-level staging debug flags appeared on actual collection payloads. The final intercepted run verified one initial view, normalized group route, one confirmed create after a double-click, one rejected create, no synthetic private-field canaries, no pre-consent collection, and no new collection after withdrawal or on the excluded invite document.

A guarded delivery run forwarded only the synthetic confirmed-save batch to the exact test measurement ID. Google returned HTTP 204. The batch contained `expense_creation_started`, `category_suggestion_completed`, `expense_created` and `category_suggestion_accepted`. All other collection requests were intercepted. HTTP 204 establishes endpoint delivery. Visual DebugView receipt was not independently observed.

The served tag still advertised automatic history and form detection and user-provided data capabilities at inspection time. Confirm the Enhanced Measurement and Google tag settings on the test property. This run does not establish the final Admin configuration, complete browser coverage, or release readiness. Focused verification passed 21 Jest tests, three isolated Chromium tests, lint, TypeScript and the optimized test build.

### DebugView confirmation

The user supplied a DebugView screenshot showing seven events from the 6:53 a.m. Central
headed Chromium test on 2026-11-25. It shows one each of `page_view`,
`expense_creation_started`, `expense_created`, `category_suggestion_completed`,
`category_suggestion_accepted`, `first_visit`, and `session_start`. The displayed
`non_personalized_ads=1` is consistent with the captured tag configuration. The test
forwarded the initial view and one successful save batch to `G-LCDPWZ61JR`. This confirms
DebugView ingestion for that synthetic session. The failure, group-route and withdrawal
checks remain supported by intercepted network evidence. Broader reporting and production
readiness remain open. The stream screenshot showed Enhanced Measurement off, and the
owner confirmed the property Internal Traffic filter was in Testing.

### Production build configuration check

The owner confirmed the production privacy settings and requested collection at deployment.
An optimized local build using the exact Cloud Build substitutions was exercised in Chromium
with every request intercepted. Accepting consent at the TrackSpense production hostname queued
one page view and requested only the new TrackSpense tag, with DebugView disabled.
Before consent, after decline, or on the marketing hostname, the build made no tag request.
The focused analytics and consent suites passed all 26 tests. Live production verification
remains a post-deploy step.
