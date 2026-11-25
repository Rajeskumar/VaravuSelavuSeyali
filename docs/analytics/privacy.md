# Analytics privacy design — proposed

2026-11-24 · TS-GA4-001 · Approval pending. Applies to web; native/MCP implementation excluded.

## Data boundary

Application state → typed, per-event allowlist → runtime validator → consent/environment/route gate → GA4 adapter → Google. No raw domain object, API request/response, exception, DOM text, URL, receipt or chat object crosses this boundary. The adapter adds only approved context. Unknown events, unknown keys, non-enum values, nested objects and oversized values reject the **whole event**, fail closed and never throw into product code. Diagnostics record only a static reason code locally, never rejected values.

Prohibit names, email, phone, credentials, tokens, amounts, descriptions, merchant/item/category labels, receipt images/lines/fingerprints, group names/IDs, member information/counts, expense IDs, spreadsheet IDs, tags, payment handles, AI prompts/responses, raw errors, URL searches/fragments and arbitrary campaign strings. Hashing prohibited data does not make it allowable. Opaque local attempt tokens are never transmitted. See the exact schema in [event catalog](event-catalog.md).

## Consent and withdrawal

Use basic opt-in: no GA script, SDK events, cookies, cookieless denied-consent pings or replay queue before a grant. Preserve current `vs_analytics_consent` choices. A stored grant may resume collection only after every environment and route safety condition passes. Storage failures default to no collection; do not break rendering or authentication.

Provide “Analytics preferences” in public footer and Account, usable after either choice, with equally reachable Accept/Decline. Explicit withdrawal closes the local gate synchronously, sets the documented `ga-disable-<ID>` flag, clears unsent events and analytics identity, deletes only TrackSpense-owned analytics cookies at the configured host/path, then reloads if needed to discard SDK listeners. Never clear auth, AI consent or expense drafts. Do not send a “consent revoked” analytics event. Synchronize revocation via storage events across tabs; delayed callbacks and pending script loads must re-check consent before sending. An in-flight request cannot be recalled; disclosure must acknowledge this. Re-grant starts fresh collection on the current safe page, never replays activity while denied.

Marketing consent is a separate origin choice; shared cookies must not be mistaken for permission. Configure a TrackSpense-specific cookie prefix and host-only domain to avoid deleting marketing cookies or silently sharing identity. Confirm old parent-domain cookie behavior in staging; do not remove marketing-owned cookies to achieve TrackSpense withdrawal. Switching to a new cookie identity causes a discontinuity in returning-user counts.

Google describes [basic and advanced consent behavior](https://developers.google.com/tag-platform/security/concepts/consent-mode) and the [GA disable flag](https://developers.google.com/tag-platform/security/guides/privacy). The design chooses no collection before opt-in; merely sending `analytics_storage:denied` with an active SDK is insufficient for that promise.

## Identity

Recommended initial scope: no application User-ID and no email-derived hash. GA's consented browser identifier is pseudonymous, not anonymous. `identify` exists in the provider interface but rejects account identifiers and remains disabled until a separate identity design is approved. `resetIdentity` clears local lifecycle/dedup context and GA user fields; on logout/account switching rotate the TrackSpense-owned browser identity through a verified fresh SDK lifecycle, not just `user_id:null`. An old asynchronous operation must not emit into the next account's session.

This intentionally limits account-level retention, cross-device joins and marketing-to-product user stitching. Same-browser signup-to-expense can be measured within the consented identity segment; logout/reset breaks it. A future cross-platform ID requires a dedicated random server-issued value, lifecycle/deletion rules and approval; no backend GA Measurement Protocol pipeline is proposed.

## URLs and automatic metadata

A single registry derived from `App.tsx` supplies stable route ID, template and static title. Strip all query and fragment content, including UTM/click-linker parameters, rather than maintaining a blacklist. Default to no campaign overrides. External referrers use only a finite approved origin mapping (`cerebroos.com` and chosen search/referral origins); unknown origins become empty. Internal referrers use the previous safe virtual page. Never forward a previous sensitive route or arbitrary subdomain. This sacrifices granular acquisition attribution intentionally; broadening it requires a reviewed registry.

Never initialize or collect on `/ai/*`, `/account/assistants`, `/reset-password`, `/verify-email` or `/groups/join/:token`; clear referrer continuity across them. Unknown routes become a static `/not-found` synthetic location, never raw input. Entering an excluded SPA route after initialization must suspend the actual SDK **before URL history mutation**, not just suppress custom events. If early navigation interception and outgoing-payload tests cannot prove that, use a full document transition into the excluded area with GA absent. On returning, initialize only on the committed safe route. Do not weaken this to a post-navigation effect.

Disable overlapping enhanced measurement as described in the Admin runbook. Also set safe page context before initial config and each permitted navigation and inspect all SDK events (`session_start`, `first_visit`, `user_engagement`, transport metadata), including unload/visibility behavior. Manual event validation alone does not establish SDK privacy. Keep the production kill switch off until this is verified with the actual tag on a separate test property.

Set advertising consent denied, `allow_google_signals:false` and `allow_ad_personalization_signals:false` before configuration; do not enable user-provided data collection or Ads linkage. Review Google Signals, location/device granularity and ad settings in Admin. Google documents these [configuration controls](https://developers.google.com/analytics/devguides/collection/ga4/reference/config). Standard protocol identifiers, browser metadata, timestamps and IP transport remain residual data disclosed by the policy; they are not financial event properties. Minimize supported controls and inspect residual payloads rather than promising zero metadata.

## Threat and failure analysis

| Scenario | Required control/evidence |
|---|---|
| URL contains invite/reset token, merchant name, prompt, email or arbitrary slug | Closed route registry; excluded sensitive routes; zero search/hash; negative outbound-payload fixtures. |
| Tag emits automatic history/form/search/link events | Admin coordination; safe SDK lifecycle; actual-tag browser interception tests before release. |
| Consent changes while a request/script is pending | Send-time consent and identity-generation checks; discard buffered work; zero new collection after withdrawal. |
| Same browser changes accounts | Clear local event state and rotate owned analytics identity; stale callback test. |
| API writes succeed but reply is lost | Report `outcome_unknown`; never retry a financial write for analytics, never invent success. |
| Schema receives malicious object/getter/huge string | Safe validator guarded by no-throw wrapper; reject unknown values without logging input. |
| GA unavailable, CSP-blocked, storage denied | No-op adapter; bounded in-memory bookkeeping; no product awaits an analytics operation. |
| Shared stream/cookies change marketing behavior | Approved joint release or dedicated app stream; independent marketing verification. |

## Historical data and policy work

The user reports group UUIDs already collected. Owner should inspect restricted GA exports for path/query/referrer/form/search leakage over August 26–November 23, 2026 and later dates, assess whether bearer tokens were exposed, and handle any confirmed security incident through existing procedures. Record affected fields/date ranges without copying identifiers into this repository. Data redaction affects future collection; code changes do not erase history. Prepare a scoped deletion proposal only after evidence review; **no deletion is authorized**. Review [GA redaction](https://support.google.com/analytics/answer/13544947?hl=en) and administrator deletion controls.

Update the public privacy policy during implementation to describe optional behavioral analytics, preferences/withdrawal, metadata, identity limits and retention. Product/legal owner must review applicable jurisdictions and the existing draft policy; this design is not a legal conclusion. Recommend two-month event/user retention with renewal disabled initially, sufficient for matured D30 cohorts; longer analysis needs a justified, separately approved retention choice. No advertising, replay, heatmaps, new paid services or financial values are proposed.
