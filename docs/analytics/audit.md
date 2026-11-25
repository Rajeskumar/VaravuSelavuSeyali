# GA4 audit — Phase 1

2026-11-24 · TS-GA4-001 · Source baseline `aa254b84c3f62d974cd9a594fbc5568841ef3208`.
Status: source audit and isolated harness verification complete; production runtime and GA4 Admin unverified. No application or GA4 configuration changes made. Web only: the iOS/Android audit is in [`mobile.md`](mobile.md) §1.

## Evidence boundaries

The supplied August 26–November 23 report summary describes a shared CerebroOS property: 84 active users, 79 new users, 824 views, 1,696 events, 274 session starts, 236 scrolls, 235 engagement events, 79 first visits, 42 form starts, six clicks, no custom product/key events, and group UUIDs in paths. These are user-provided observations, not independently retrieved reports. Do not label 84 as TrackSpense users without a hostname filter. No GA4 connector/report export was available; property numeric ID, stream numeric ID, deployed code, current Admin settings and Porkbun traffic composition remain unverified.

Paths below are repository-relative unless marked sibling. The sibling marketing checkout was inspected read-only; its deployment state is unknown. Marketing source HEAD: `52d035b893e536e43de2892834b28f95d1b51c6b`.

## Verified findings

| ID | Finding and implication | Evidence |
|---|---|---|
| A01 | One application-owned GA4 loader, no GTM container or second GA4 initialization found. A DOM ID guard prevents repeated initialization in one document. **Duplicate page views are not established.** | `varavu_selavu_ui/public/index.html:43–46` loads only `analytics-stub.js`; `public/analytics-stub.js` queues commands; `src/utils/analyticsConsent.ts:19–30`, `loadGoogleAnalytics`, checks `ga4-script`. Isolated double-init harness: one script, one config. |
| A02 | No custom product event, manual SPA page-view tracker, analytics `user_id`, or provider abstraction found in web/backend/mobile source. Backend `/analytics/*` is financial insight computation, not telemetry. | Repo search for `gtag`, `googletagmanager`, `google-analytics`, measurement ID and consent helpers; only loader issues `js`/`config`. |
| A03 | Measurement ID `G-0M1N9KSEW5` is hard-coded; consent-granted development/test executions invoke the same configuration. Actual historical contamination is unproven. | `src/utils/analyticsConsent.ts:2`; no environment/hostname/test checks. `Dockerfile` runs CRA build; `cloudbuild.frontend.yaml` supplies no analytics build arguments. Harness confirms development/test loader behavior. |
| A04 | Initial collection waits for explicit or stored consent. Denial before initialization avoids loading. Revocation merely writes localStorage and does not disable an already loaded tag. No persistent analytics preferences control found. | `getStoredConsent`, `initAnalyticsFromStoredConsent`, `grantAnalyticsConsent`, `denyAnalyticsConsent`; `components/common/ConsentBanner.tsx:38–40` and its early return after decision. Harness: deny after grant emits no consent command and sets no disable flag. |
| A05 | Storage access and missing `gtag` can throw; script load failures are not handled or retried. This is distinct from proving that an ordinary network blocker crashes the app. | `analyticsConsent.ts:7,12,29`; harness reproduces blocked storage and missing queue errors. |
| A06 | No explicit location, referrer, title or campaign sanitization; no `send_page_view:false`. GA's defaults can transmit URLs and history changes according to Admin settings. User reports raw group paths; other sensitive leakage is a **risk**, not proven historical collection. | `analyticsConsent.ts:30`; `App.tsx` routes include `/groups/:id`, `/groups/join/:token`; reset/verify query tokens; Ask `?q=`, analysis `?item=`/`?merchant=` and tag filters. |
| A07 | `/ai/*` is excluded only at loader invocation. A previously loaded tag is not suspended on SPA entry into assistant routes. A cold assistant-route load also does not automatically initialize when leaving it. | `analyticsConsent.ts:20`; `AppContent` initializes once on mount and hides banner for `/ai/`; no route tracking/suspension subscriber. |
| A08 | Title handling exists. It is a React pathname effect, separate from analytics. Several paths intentionally share a title. Historical or timing differences are plausible, not proven report causes. | `components/common/RouteA11y.tsx`, `titleForPath` and `useEffect`; all group routes title “Groups”, analysis tabs “Analysis”; `public/index.html:56` supplies the initial landing title. |
| A09 | Login persists an email in `vs_user`; no code passes it to GA. Logout/auth-expiry/account switching clear application identity but have no analytics identity lifecycle. Never reuse this email as an analytics ID. | `pages/LoginPage.tsx`, `RegisterPage.tsx`; `App.tsx/handleLogout`; `api/api.ts/forceLogout`; `hooks/useSessionIdentity.ts`. |
| A10 | CSP permits GA tag and collection hosts; it is not a payload scrubber. Script `unsafe-inline` is absent in actual nginx config, despite stale spec §9 security wording. | `varavu_selavu_ui/nginx.conf:21`; `docs/TrackSpense_Complete_Product_Specification.md:861`. Referrer policy is `no-referrer`, not a replacement for payload overrides. |
| A11 | Consent tests cover banner visibility and Decline; route tests cover title/focus. No GA payload/transport, revocation, event schema or exactly-once analytics tests found. QA has no universal GA network interception. | `ConsentBanner.test.tsx`, `RouteA11y.test.tsx`, `qa/playwright.config.ts`; targeted repo search. Existing test results in verification report. |
| A12 | Marketing source uses the same ID and unconditional tag/config. Shared-stream Admin changes can affect that site. | Sibling `/Users/rajeshkumarganesan/Documents/workspaces/cerebroos/public/index.html:38–45`. `src/pages/LandingPage.tsx` links to `/expense`; `src/App.tsx` has no `/expense` route, so edge redirect behavior must be checked. No Porkbun references found in the inspected marketing source. |
| A13 | Privacy policy promises analytics only after acceptance and a right to opt out. The policy still describes itself as a draft template. Consent implementation needs a reachable withdrawal control. | `varavu_selavu_app/privacy_policy.html` §2b, service-provider table and §10 rights; ROADMAP legal-review item. This audit makes no legal compliance certification. |

## Page-title versus page-path investigation

GA's default title is `document.title`, location is the current URL. Title groups and path groups are not one-to-one: group IDs produce many paths with the same “Groups” title, query-only tabs do not change the title, and both hostnames share a stream. `RouteA11y` now changes titles after React commits; the tag's automatic history observation is not coordinated with that effect. Initial title/config ordering and stale previous titles on history changes need runtime inspection. The supplied summary does not include the actual title/path cross-tab or deployment dates, so it cannot establish which mechanism explains the discrepancy.

Verify using identical dates, hostname, stream and page_view filters, then compare title × normalized path × hostname. With synthetic data on a non-production property, inspect the initial view, push/replace/pop navigation, guard redirects and query changes; correlate each outbound payload with the committed route/title. Do not infer duplicate views from event totals or from Strict Mode alone.

## Existing business semantics that constrain instrumentation

- `RegisterPage.handleRegister`: registration and auto-login share a try block. Count `sign_up` after registration acknowledgement even if subsequent login fails; do not emit `signup_failed` for that later failure.
- `auth/routers.py/google_login`: creates or authenticates an account but returns the same `TokenResponse`; client cannot truthfully distinguish new Google signup. Record login only until an additive server indicator is separately agreed.
- `hooks/useLogExpense.ts/logToGroup*`: expense POST precedes tag application and refresh. Emit confirmed create at persistence acknowledgement, not after all follow-up work.
- `QuickCaptureSheet.handleSave` has a synchronous save lock and persisted unknown-outcome guard. Preserve it. Timeout/5xx is not proof the ledger write failed.
- `api/routes.py` itemized create rejects a repeated receipt fingerprint with 409; never call that a new create. Never transmit the fingerprint or conflict payload.
- `JoinGroupPage` accepts invitations from an effect. Guard duplicate effect work and success callbacks; count only accepted transitions.
- `AIAnalystChat.handleSubmit` receives answer text, not a reliable structured list of committed ledger writes. Never infer expense creation by parsing the answer.
- First-ever expense and completed onboarding are not authoritative analytics facts in current responses. The checklist is feature-dependent and locally dismissible. Reserved events and reporting alternatives are explicit in the catalog.

## Reused discovery

`docs/qa/01-feature-inventory.md`, `02-interaction-inventory.md`, `03-user-journeys.md`, `04-uat-test-cases.md`, `qa/TEST-CASES.md`, `docs/FEATURE_STATUS.md` and source handlers supplied the journey inventory. Prior QA runtime evidence belongs to its original audit; this audit does not reclassify it as new runtime verification. Mobile has separate native routes, consent/storage/OCR behavior; no mobile analytics is added by this work.

## References

Google's [page-view guide](https://developers.google.com/analytics/devguides/collection/ga4/views), [SPA verification guide](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications), [enhanced measurement settings](https://support.google.com/analytics/answer/9216061?hl=en), and [disable control](https://developers.google.com/tag-platform/security/guides/privacy) were checked on 2026-11-24. Admin state still requires account evidence. See [implementation plan](implementation-plan.md), [privacy design](privacy.md) and [verification report](verification-report.md).
