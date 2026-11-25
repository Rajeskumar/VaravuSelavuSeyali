# GA4 web foundation

2026-11-25 · TS-GA4-001 · Implemented and configured for the next authorized production release.

The web adapter uses the existing consent key. Analytics preferences in the home footer and Account let people grant or withdraw permission. Withdrawal disables the loaded tag, clears queued commands and owned cookies, and reloads when the stored decision can safely be carried to the new document. Account changes clear local operation state and retire the current tag. The adapter sends no application User-ID.

The route registry supplies static titles, stable route identifiers and normalized paths. React dispatches one page view per committed pathname transition. Sensitive routes are excluded. The browser adapter intercepts forward history mutations before a loaded tag can observe sensitive targets, and disables collection at the earliest registered browser traversal listener. Actual SDK behavior on navigation, unload and browser restoration still requires verification.

The event schemas and operation deduplication support the [web product-event producers](product-events-status.md). See the [catalog](event-catalog.md) for event semantics and the [admin runbook](ga4-configuration.md) for the remaining configuration and validation.

Standalone builds default to disabled. The production release pipeline opts in with an exact host and measurement ID pair. Confirm Google’s actual automatic event fields, cookie naming and disable behavior with the approved non-production property before enabling collection. The browser fixture exercises the application adapter and intercepts every request. The local test confirmed a synthetic save in DebugView and inspected real SDK payloads. The owner confirmed the production privacy settings. The live smoke check follows deployment.

See [verification evidence](verification-report.md) and [SDLC record](../sdlc/work-items/TS-GA4-001/work-item.json).

## Production destination

The owner supplied `G-X3QFP5HNK2` from the new **TrackSpense Production** property on
2026-11-25. This supersedes the proposed placement of the app stream inside the marketing
property. The build configuration pairs this ID with `https://expense.cerebroos.com`.
Marketing keeps its existing tag. The verified local-test ID is separate from the production build.

The owner confirmed Enhanced Measurement and user-provided data capabilities are off for
the production stream and requested collection on the next deployment. The frontend release
build sets both `_ANALYTICS_ENABLED` and `_ANALYTICS_CONFIG_VERIFIED` to true. If a rollback
is needed, rebuild with `_ANALYTICS_ENABLED=false`. Use a consented landing-page view
for the production smoke check and confirm it in Realtime in **TrackSpense Production**.
