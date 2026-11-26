# Work item — port core analytics into the CerebroOS mobile app template

Status: backlog, not planned (Discover/Plan not started). Created 2026-11-25 as a follow-up of TS-GA4-002 (owner approved the card; the rest later).

## Problem and outcome
`varavu_selavu_mobile/src/core/analytics`, the generic Firebase config plugins (`withFirebasePrivacy.js`, `firebaseConfig.js`, `firebase.json`, the Firebase-aware `withSceneLifecycle.js`), the consent UI and `docs/analytics/mobile.md`'s generic parts were built to be product-agnostic (`docs/mobile/CORE_BOUNDARY.md`). Port them into the sibling repo `cerebroos-mobile-app-template` once TS-GA4-002 is working and tested, with a small example in the template's Notes feature, so every future CerebroOS app starts with consent-gated analytics and crash reporting.

## Plan
Starts only after TS-GA4-002 passes real-device Firebase verification. Expected risk: high (privacy boundary, personal data). Separate repo: needs its own commit and approval. Exclusions: TrackSpense's event table and screen registry stay out of the template.

## Tests / Evidence
To be written at Plan.
