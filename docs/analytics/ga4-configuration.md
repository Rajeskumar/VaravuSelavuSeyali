# GA4 administrator runbook — proposed changes only

2026-11-24 · TS-GA4-001. **No settings have been changed.** Production configuration, filters, deletion and releases need explicit approval. Record screenshots/settings summaries with restricted access; keep personal identifiers and raw sensitive URLs out of repository artifacts.

> **Mobile (TS-GA4-002):** the iOS and Android apps use Firebase Analytics/Crashlytics linked to the same TrackSpense Production property as separate data streams. Firebase projects, streams, retention and DebugView steps are in [`mobile.md`](mobile.md) §6. Nothing in it has been applied.

## Inventory and change sheet

| Item | Current evidence | Proposed / verification |
|---|---|---|
| Provider | GA4/gtag.js in both local source checkouts | Retain. No GTM migration. |
| Measurement ID | `G-0M1N9KSEW5` in TrackSpense and marketing HTML | Confirm live destinations, property/stream numeric IDs and linked tags in Admin; do not confuse measurement ID with property ID. |
| Property/stream | User reports CerebroOS shared web stream | Owner confirms property name/timezone/stream URL, hostnames, settings, tag destinations, cross-domain configuration and permissions. |
| Enhanced measurement | User reports all seven categories enabled | Independently inventory current controls before changes. |
| Marketing routing | Local CTAs link to `/expense`; React router lacks that route | Read-only verify edge redirect to app and referrer behavior; deployed rules absent from this audit. |
| Signals/Ads/user-provided data | Unknown | Record current settings; propose disabled for app, review property-wide implications. |
| Retention/filters/key events/custom dimensions | Unknown; supplied report had no key events | Inventory before creating or altering. |

Recommended: create a dedicated TrackSpense web stream **in the same GA4 property**, retaining the old stream on marketing. This separates stream-level collection controls, not all property-level reporting/settings. Use a separate property for staging. A new stream creates a measurement discontinuity; document cutover date and never dual-send. Stream creation and production ID activation need approval. If keeping the shared stream, use the joint sequence below.

## Page views and enhanced measurement

The app will use manual normalized page views with `send_page_view:false` in each config initialization. Admin → Data collection and modification → Data streams → intended web stream → Enhanced measurement settings:

- Turn off history-change page views in Page views advanced settings for the app stream. Default page-load behavior is controlled by the app's config; do not assume one toggle covers both.
- Disable site search, form interactions, outbound clicks, file downloads and video engagement for the app. Disable scroll as unnecessary incidental tracking. Outbound/download auto metadata can include link URLs/text; search can include terms; forms can include identifiers/destinations.
- Review Google tag automatic event-detection settings and linked destinations too. Avoid adding custom events that recreate the same raw metadata. Essential automatic events still require full payload verification.

Google documents [enhanced measurement controls and captured fields](https://support.google.com/analytics/answer/9216061?hl=en), [manual page-view setup](https://developers.google.com/analytics/devguides/collection/ga4/views), and [SPA verification](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications).

**Shared-stream alternative:** capture baseline for both sites; marketing owner prepares consent-aware page tracking for every real route and verifies `/expense` redirect; deploy both manual-tracking implementations disabled; approve stream settings change; enable and verify one view per meaningful navigation on **both** sites. Marketing can retain its explicit initial `config` page view only if its design accounts for that one view and has no second initial manual view. Do not disable default views globally without replacement. If coordinated cutover is unavailable, keep new app collection off and use the dedicated-stream option. Never alter marketing code from this repository without authorization.

## Dimensions, key events and comparisons

Register only event-scoped dimensions used in a report: `product`, `feature`, `entry_method`, `outcome`, `error_code`, `duration_bucket`, `expense_scope`, `view`. Add `filter_type`, `action` or `export_type` only when the corresponding dashboard needs them. `platform` can distinguish future MCP/native producers when needed; GA already has a platform concept, so avoid redundant registration initially. Standard page/title/location dimensions cover normalized routes; `route_id`/`route_template` need custom registration only if used beyond standard page reports. `app_version` stays unregistered unless release comparisons justify it. Use GA recommended `method` mapping for login/signup. No user-scoped dimensions or resource IDs.

Initially mark `sign_up` as a key event only after password-registration semantics are validated. Do not mark every expense as an activation key event. Keep `first_expense_created` unregistered until authoritative support exists. If stakeholders want an observed-activation key event, approve its precise session/cohort rule separately; an exploration funnel is sufficient initially. Event-scoped dimensions are not retroactive backfill.

Create saved comparisons for TrackSpense hostname, marketing hostname, app stream (if split), and product. Old automatic events lack `product`; retain hostname/stream comparisons for historical reports. Never combine old raw paths and new templates without documenting the cutover.

## Acquisition and Porkbun investigation

No actual Porkbun rows, timestamps or referral URLs were supplied and source search found no Porkbun attribution override. Its cause is **undetermined**. Do not add Porkbun to unwanted referrals on this evidence alone.

1. Owner exports a restricted aggregate exploration for the report period and recent period: session source/medium, first-user source/medium, page referrer, landing page, hostname, stream, date/hour, sessions, engaged sessions and subsequent product activity. Inspect sensitive fields privately; share only redacted summaries.
2. Separate marketing versus app hostnames and true referral entries versus invalid hostnames. Look for clusters matching the owner's domain-control-panel visits, registrar preview/parking/forwarding pages, redirect chains, bots/spam or organic visits. None is assumed from the registrar name.
3. Reproduce the actual marketing `/expense` transition in a synthetic staging session with network/header inspection. Check domain forwarding/parking configuration read-only and compare dates with the referral clusters. Avoid creating synthetic production events.
4. If owner/admin testing explains traffic, prefer validated internal-traffic handling. If a legitimate intermediary resets attribution, prepare a narrow unwanted-referral proposal with before/after test evidence. If spam is suspected, validate traffic validity before choosing a filter; ignoring referrals does not delete spam sessions or repair historical data.
5. Obtain explicit approval before any production attribution change; annotate date and expected affected reports. Do not auto-ignore all unexpected domains or use broad regexes.

See Google's [unwanted referral guidance](https://support.google.com/analytics/answer/10327750?hl=en). Shared cookies, removed query parameters, cross-domain linking and late consent can all affect attribution; they require controlled evidence rather than guessed fixes.

## Traffic filters, retention and redaction

- First exclude local/test traffic in application configuration and block production collectors in QA. Do not rely on GA filters as the primary separation control.
- Document real developer/internal network definitions (including VPN/dynamic-IP limits). Start proposed internal/developer filters in **Testing** with synthetic test-property evidence; inspect which rows they would exclude. Activating a production filter requires approval because excluded data cannot later be recovered. [Google data filters](https://support.google.com/analytics/answer/13296761?hl=en-GS).
- Review existing retention with the privacy owner. Proposed default is two months and no renewal on activity; D30 cohorts must mature within retained data. Longer weekly/monthly comparisons may need a justified fourteen-month choice. Do not silently shorten retention, which can remove data. [Retention behavior](https://support.google.com/analytics/answer/7667196?hl=en).
- Enable/review email and query-parameter redaction as defense in depth for the approved stream. Test sensitive keys such as token, code, state, email, q, item, merchant and tag parameters using synthetic values; application strips **all** query values regardless. Redaction does not remove path UUIDs or repair already collected data. [Data redaction](https://support.google.com/analytics/answer/13544947?hl=en).
- Review property-level Signals, granular location/device collection, advertising personalization, Ads links and user-provided-data features with both website owners. App code also disables advertising signals and uses consent controls. Never imply all these settings are stream-local.

## Controlled verification and evidence

Use a separate test property and synthetic users/data; enable `debug_mode` only in that configuration. Never set a debug query parameter that bypasses the production environment gate. Test a clean profile, stored grant/denial, re-grant, cross-tab withdrawal and account switching. In browser network interception capture GET query, POST form/body and beacon batches; decode URL encoding and assert every event's `dl`/`dr`/`dt` and custom fields against the contract. Observe automatic events, load/unload/visibility changes, redirects, group changes and excluded routes, not just explicit product events.

A local fake SDK is useful for deterministic tests but is not real-provider evidence. Actual-tag testing uses either the isolated test property (manual DebugView) or real SDK loading with **all collection intercepted and aborted** before reaching Google. Never use production ID for either. Record source revision, browser, test property/stream, build config, Admin settings timestamp, sanitized payload examples, observed event counts and request-blocking evidence. No real bearer tokens or user data in traces.

Verify in DebugView: one normalized page_view at initial grant and each committed route; no redirect source/query-only extra views; expected title/referrer; one create after successful save; none after rejected save; no new collection following withdrawal or on excluded pages. Check Realtime and subsequent reports separately; network observation proves payload shape, DebugView proves ingestion, neither proves long-term reporting correctness alone.

## Explorations/report setup

Use [catalog formulas](event-catalog.md#reporting-definitions). Build password signup_started → sign_up → E within seven days; compare capture methods and receipt_parse_started → completed → E(receipt) as user/session funnels, never imply per-receipt matching. Path exploration uses normalized page paths and Ask/groups/expenses destinations, excluding generic incidental events. Build separate meaningful-product-activity weekly/monthly cohorts and exact D7/D30 return explorations; retain standard GA retention under its own definition.

For reliability show definitive failure, unknown, cancelled and abandoned attempts separately. Small samples and consent coverage must remain visible. Approve reports after populated test data reconciles with the deterministic fixture; no production financial reconciliation export is needed.

## Recovery

On duplication/leakage, disable app collection first and preserve only sanitized evidence. Keep business features available. Do not revert to raw automatic history tracking as an emergency fix. Restore/change Admin settings only with approval and checks on both hostnames. Historical deletion is a separate owner-reviewed request with exact scope/date range; this runbook does not authorize it.
