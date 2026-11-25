# GA4 web foundation

2026-11-25 · TS-GA4-001 · Implemented locally. Collection is disabled by default. The production host and stream are configured in source.

The web adapter uses the existing consent key. Analytics preferences in the home footer and Account let people grant or withdraw permission. Withdrawal disables the loaded tag, clears queued commands and owned cookies, and reloads when the stored decision can safely be carried to the new document. Account changes clear local operation state and retire the current tag. The adapter sends no application User-ID.

The route registry supplies static titles, stable route identifiers and normalized paths. React dispatches one page view per committed pathname transition. Sensitive routes are excluded. The browser adapter intercepts forward history mutations before a loaded tag can observe sensitive targets, and disables collection at the earliest registered browser traversal listener. Actual SDK behavior on navigation, unload and browser restoration still requires verification.

The event schemas and operation deduplication support the [web product-event producers](product-events-status.md). See the [catalog](event-catalog.md) for event semantics and the [admin runbook](ga4-configuration.md) for the remaining configuration and validation.

Build inputs default off in the frontend Dockerfile and Cloud Build. Activation requires a reviewed exact host and measurement ID pair, and separate Admin and release approval. Confirm Google’s actual automatic event fields, cookie naming and disable behavior with the approved non-production property before enabling collection. The browser fixture exercises the application adapter and intercepts every request. The local test confirmed a synthetic save in DebugView and inspected real SDK payloads. Production GA4 settings and the smoke check remain pending.

See [verification evidence](verification-report.md) and [SDLC record](../sdlc/work-items/TS-GA4-001/work-item.json).

## Production destination

The owner supplied `G-X3QFP5HNK2` from the new **TrackSpense Production** property on
2026-11-25. This supersedes the proposed placement of the app stream inside the marketing
property. The build configuration pairs this ID with `https://expense.cerebroos.com`.
Marketing keeps its existing tag. The verified local-test ID is separate from the production build.

Before activating, confirm Enhanced Measurement and user-provided data capabilities are off
in the production stream and review its tag destinations against the [Admin runbook](ga4-configuration.md).
Cloud Build defaults both `_ANALYTICS_ENABLED` and `_ANALYTICS_CONFIG_VERIFIED` to false.
Activation requires both values to be true in the authorized release build. Use an ordinary
consented landing-page view for the production smoke check and confirm Realtime in **TrackSpense Production**.
