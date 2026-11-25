# GA4 implementation plan — approval requested

2026-11-24 · TS-GA4-001 · Proposed, not implemented. Priority P1, size L, semantic risk **high** (personal-data destination, consent, financial outcome semantics, build configuration). The current patch is documentation-only; that does not lower the future implementation tier.

## Recommended decisions for approval

1. Retain GA4/gtag with a small TypeScript adapter and closed event schema; no new analytics dependency, backend telemetry pipeline, paid service, mobile or MCP instrumentation.
2. Basic opt-in and reachable withdrawal; no collection on sensitive routes; no application User-ID initially. Accept browser-segment reporting and safe-attribution limits described in the catalog.
3. Implement the catalog's P events; reserve lifetime-first-expense, durable onboarding, Google-new-account signup, separate receipt-upload/saved-receipt events and AI-created ledger-write analytics. They are unsupported, ambiguous or redundant in current contracts. Signup→first observed expense remains available, with explicit limits. If exact account activation/cross-device retention is mandatory, return to Plan for authoritative milestones and random identity; do not quietly approximate them.
4. Preferred operational path: a dedicated **TrackSpense web stream within the existing GA4 property**, with restrictive automatic collection, leaving marketing's existing stream unchanged. This retains GA4 and avoids breaking marketing; production stream creation/configuration still needs separate authorization. If retaining the single stream is preferred, both site owners must approve the coordinated manual-tracking/consent transition before enabling app collection. Never silently disable marketing history tracking.
5. Default all environments off until explicitly configured and verified. Production activation, GA4 Admin edits, historical deletion and cross-repository marketing writes remain separate approvals even after this plan is approved.

These are proposed choices, not lasting approved decisions. Phase 1 stops here by the user's explicit instruction: “Start with Phase 1 and present the findings and implementation plan for approval.” No board issue is created before plan approval.

## Architecture

Proposed `varavu_selavu_ui/src/analytics/`:

- `events.ts`: pure names, per-event types/enums and runtime schema, no DOM/React references. JSON-compatible contract suitable for future packages; no monorepo/shared-package migration now.
- `privacy.ts`: pure allowlist validation and static error mapping; never import or serialize expense/user objects.
- `routes.ts`: closed route IDs/templates/titles and route sensitivity. Reuse from `RouteA11y` so a11y title and analytics title cannot diverge; keep focus behavior intact.
- `config.ts`: explicit environment, enabled flag, measurement ID, approved hosts, release version and reviewed-configuration readiness flag. No default production ID.
- `providers/ga4.ts`: sole owner of `gtag`, safe initialization/disable/reset, cookie settings, context and page events. `providers/noop.ts` and a recording test adapter.
- `client.ts`: `initialize(config)`, typed `track(event, props, localOperation?)`, `trackPageView(safeRoute, localNavigation)`, `identify(opaqueId)`, `resetIdentity()`, `setConsent(choice)`, `disable()`. Calls are synchronous/no-throw to product callers; asynchronous loading is internally contained. `identify` is disabled in v1, rejects user/account data; reset is fully implemented.
- `RouteAnalytics.tsx`: committed route adapter and dedup coordinator. Consent compatibility shim in existing `utils/analyticsConsent.ts` preserves imports/storage choices. No scattered direct tag calls.

No analytics event may block or control an API operation. At most one SDK injection per live lifecycle; no durable queue, bounded dedup state, no background timer retry storm. GA script failure leaves business functionality available. Explicit environment disable overrides consent.

### Route registry and navigation contract

Derive from actual `App.tsx/Routes`, with ordered specificity. Proposed mappings:

| Actual route | Analytics template / stable ID | Policy |
|---|---|---|
| `/` | `/`, `home` | Static title from registry; signed-in Home redirect counts final dashboard only. |
| `/login`, `/register`, `/forgot-password`, `/contact` | Same literal path; `login`, `register`, `forgot_password`, `contact` | Static titles; no form or URL metadata. |
| `/dashboard`, `/expenses`, `/groups`, `/analysis`, `/ask`, `/account` | Same literal path; corresponding stable ID | Count committed visible route. |
| `/groups/:id` | `/groups/:groupId`, `group_detail` | Match static `/groups` first; never actual ID. |
| `/groups/join/:token` | Internal descriptor `/groups/join/:token`, `group_join` | Excluded completely, before generic group matcher. |
| `/reset-password`, `/verify-email` | Internal static descriptors | Excluded, with or without token. |
| `/ai/connect/:id`, `/ai/approve/:id`, `/ai/reauth`, `/account/assistants` | Internal descriptors only | Excluded, including preloaded SDK case. |
| `/recurring`, `/ai-analyst`, `/item-insights`, `/merchant-insights`, `/profile` | Resolve to `/expenses`, `/ask`, `/analysis`, `/analysis`, `/account` | Redirect shims emit zero; only committed destination emits. |
| `*` | `/not-found`, `not_found` | Static synthetic URL/title; no arbitrary path. |

There is **no** `/expenses/:id` route in this router. Do not invent one; a future route requires registry/catalog/tests in the same change. Query/hash-only changes do not emit page views. Analysis tab use has its own event; no amounts, item names or filter values in virtual URLs. Two different groups are meaningful navigations even though both emit the same normalized template; compare ephemeral actual-router transitions locally without transmitting their resource values.

Use a committed-navigation sequence plus route key, not a lifetime set of pathname/history keys: back/forward revisits must count. Strict Mode replay/remount, repeated consent init and same-page rerender do not count twice. Cancel pending redirect source views, resolve auth/guest guards before tracking, and coordinate with Home's redirect. Set document title and safe global provider context before dispatching one page_view. Initial grant emits the currently visible safe page once; no replay of prior pages. Initial internal referrer is normalized only when recognized; external origins follow privacy policy; later referrer is last emitted safe page, cleared across excluded areas. `page_location` uses configured origin plus normalized template; never browser href or current search.

Disabling default config views (`send_page_view:false`) is only one control. Enhanced measurement history detection must also be disabled through the reviewed Admin configuration. No undocumented `gtag` flag is a substitute. Privacy suspension must precede sensitive URL transitions; full document navigation is the fallback if the SDK cannot be reliably isolated. Production stays off until real-tag tests establish safety.

### Environment matrix

| Environment | Adapter / config |
|---|---|
| Local development | No-op; consent grant cannot override. Optional mock recorder for local diagnostics; no real GA. |
| Jest/automated CI | No-op by default; tests inject recording adapter. Dedicated transport tests may load actual tag only with separate test property, synthetic fixtures and denied external collection via interception. |
| Local browser payload fixture | Explicit test-only configuration and fake/test ID, local HTTP origins only, collector intercepted before page load. No production ID accepted. |
| Staging/manual DebugView | Explicit staging host and separate **non-production property**, grant required, debug enabled only here. Production ID rejected. |
| Production | Explicit production build + approved host + enabled flag + approved ID + confirmed Admin-readiness config + consent + safe route. Debug off. |

CRA substitutes `REACT_APP_*` at build time. Add documented non-secret build arguments to Dockerfile and `cloudbuild.frontend.yaml`, with fail-closed defaults; Cloud Run runtime variables alone will not change bundled JS. Proposed keys: `REACT_APP_ANALYTICS_ENV`, `REACT_APP_ANALYTICS_ENABLED`, `REACT_APP_GA4_MEASUREMENT_ID`, `REACT_APP_ANALYTICS_CONFIG_VERIFIED`; host allowlists are reviewed code, not arbitrary URL input. A production rollback build must be able to force analytics off. Test automation cannot use the production enablement path as a shortcut.

### Business operation contracts

The catalog is the definitive event owner/property table. Bind one local operation context to the domain API success boundary, preserve existing API outputs, and suppress duplicate form/hook emission. For multi-call expense edits, distinguish complete intended field persistence from partial mutation; do not claim full success if only items persisted. For creation followed by tag attachment, creation is already true and is counted once even if tags fail. Local submission locks extend to currently unguarded paths used by analytics; do not change financial retry semantics. Unknown write outcomes are not definitive failure and never auto-replay.

No backend schema, API response or migration is needed for the recommended reduced milestone scope. Any later `is_new_account`/lifetime-first marker is a separately reviewed additive backend contract; old clients must remain compatible. Native apps remain untouched; browser-neutral event definitions and documented platform field allow future native adapters with separate consent, SDK, OCR and screen lifecycle verification. MCP tools cannot inherit a browser consent bit or send browser session identity.

## Ordered implementation

| Task | Deliverable / affected area | Depends on | Evidence |
|---|---|---|---|
| T1 | Approve scope decisions; record fingerprint/authorization; mirror TS-GA4-001 Ready. Confirm GA stream strategy with owner, without changing settings yet. | Phase 1 approval | Plan/build gate |
| T2 | Add pure schema, validators, mock/no-op/GA provider, safe environment config and consent bridge; demonstrate existing failures with regression tests before fix. | T1 | ANA-01/04/06/09/10 |
| T3 | Add preferences UI, revoke/reset lifecycle, host-only cookies and disabled ads. Read web area rules; update policy after owner review. | T2 | ANA-04/06; UI/security reviews |
| T4 | Unify route/title registry, manual tracking, sensitive-route transition containment and initial/grant/redirect dedup. | T2–3 | ANA-02/03/11 |
| T5 | Instrument auth, personal/group CRUD, categorization, receipts, groups/invites/settlements, Ask using central operation ownership; preserve unknown-outcome guard. | T2–4 | ANA-05/07/08, mapped UAT |
| T6 | Add recurring, analysis/filter/export events; audit all active callers, feature-flag-off paths and partial success. | T5 | ANA-05/08; catalog completeness |
| T7 | Update Docker/build/QA configuration and network interception fixtures, isolated browser checks and actual-tag staging evidence. Read QA/backend area rules if touched. | T2–6 | ANA-09/10/11; make check |
| T8 | Review code, security, product semantics and consent UI inline after deterministic checks. Update audit/catalog/privacy/runbook/status/spec, verification and SDLC evidence. | T7 | Reviews + AC verification |
| T9 | Produce exact Admin change sheet and marketing verification evidence; after separately authorized configuration/release, run both-host smoke and reporting checks. | T8 + explicit production approval | ANA-12; release evidence |

Only routed reviews run; semantic privacy risk requires code/security, changed preferences UI requires UI, new product rules require product review. Codex applies skills inline, no redundant agents. `make route` determines file scopes after implementation; record any additional semantic routing. No native E2E unless native code/suite is actually changed.

## Tests, rollout and recovery

Detailed scenario fixtures and AC mapping live in [test-plan.md](../sdlc/work-items/TS-GA4-001/test-plan.md). Run focused Jest/RTL and existing UAT extensions, then `make check` and routed reviews. Capture actual outbound GET/POST/beacon payloads for the real SDK in a separate-property controlled run; mocked command queues alone are insufficient. Record gate `INCOMPLETE_EVIDENCE` if real transport/Admin verification remains unavailable. Synthetic browser tests must never reach the production property.

Ship code disabled first only through an authorized release. Verify staging payloads, approve coordinated Admin settings/new stream, then separately authorize production enablement. Keep explicit kill-switch rollback instructions with the candidate. If leakage/duplication appears, disable app collection; do not revert to the old unsanitized loader or blindly restore shared-stream automatic settings. Reverting Admin changes requires the marketing owner to check both sites. No historical backfill/deletion or irreversible filter activation as part of deployment.

When a future feature changes an instrumented handler, add catalog/UAT/schema changes to the same item and rerun affected privacy/payload tests. Add that lasting engineering constraint to web AGENTS.md only when implementation is approved; no unapproved architecture decision is being recorded as settled now.
