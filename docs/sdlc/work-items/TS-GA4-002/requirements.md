# Requirement agreement — TS-GA4-002

Status: agreed 2026-11-25 (owner decisions below). Owner: Rajeshkumar Ganesan. AC text is canonical in work-item.json.

## Problem and users
TrackSpense web has consent-gated GA4 (TS-GA4-001, property **TrackSpense Production**, `G-X3QFP5HNK2`). The Expo app (iOS and Android, one codebase, `com.cerebroos.trackspense`) has no analytics or crash reporting, so mobile use, failures and crashes are invisible. Audit of the mobile app: `docs/analytics/mobile.md` (written during Build).

## Outcome and scope
Firebase Analytics + Crashlytics (React Native Firebase) on iOS and Android through one shared, provider-independent analytics layer, the web's closed event catalog extended with `ios`/`android` platforms, and consent-gated, allowlist-only collection. Reuse the web design (closed schemas, operation tokens, confirmed-write producers); do not copy its code across packages — a machine-readable catalog is the shared contract.

Included: shared catalog JSON + contract tests; core analytics client, providers (Firebase, no-op, recording), sanitizers; screen tracking (one event per route-name change, automatic reporting off); producers for auth, expenses, categorisation, receipts, groups, settlements, AI Analyst, recurring, analysis; four mobile-only events (`screen_view`, `receipt_image_selected`, `permission_result`, `deep_link_opened`/`notification_opened`); two separate opt-in consents (analytics, crash reports) offered once at first launch, before sign-in, and changeable in Account; Crashlytics fatal + sanitized non-fatal reports with symbol upload config; environment selection by explicit build variable; privacy-policy and store-disclosure drafts; mobile UAT/release-checklist extension; GA4/Firebase runbook.

Excluded: any production Firebase/GA4 change, project creation, linking, EAS upload or release (owner actions, documented as a runbook); Performance Monitoring (evaluated separately); a User-ID or backend analytics id (see decisions); biometrics and offline sync (not built); nudge/lifecycle email (separate backend work item built on first-party data); building the Android app beyond analytics.

## Decisions and open questions
- **GA4 destination (owner, 2026-11-25):** Firebase production project links to **TrackSpense Production** — web, iOS and Android in one property, separate data streams.
- **Consent (owner, 2026-11-25):** separate opt-in for analytics and for crash reports, offered once at first launch (before sign-in; changed from "after sign-in" by the owner, 2026-11-25) and changeable in Account.
- **No User-ID in v1 (owner, 2026-11-25):** individual-level emails/nudges come from backend first-party data (own work item), not GA/Firebase. Reset of the Firebase app-instance identity on sign-out and account switch.
- Assumption: a Task 0 native-build spike may show React Native Firebase needs build changes (static frameworks) that conflict with `modules/receipt-ocr` or reanimated; that outcome returns to Plan, it does not authorise a workaround.
- Open for the owner after Build: Dev and Prod Firebase projects, iOS/Android apps and GA4 links (runbook).
