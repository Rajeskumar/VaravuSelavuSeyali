# Mobile analytics and crash reporting (iOS + Android)

2026-11-25 · TS-GA4-002 · **Implemented locally, not released.** One Expo / React Native codebase serves both stores (`com.cerebroos.trackspense`), so one implementation serves both. Event names, properties and meaning are **not** repeated here: they live in [`catalog.v1.json`](catalog.v1.json) (machine-readable, shared with web) and [`event-catalog.md`](event-catalog.md) (semantics and reporting formulas). Web design and privacy rules that also apply: [`privacy.md`](privacy.md). Owner decisions (2026-11-25): destination is the **TrackSpense Production** GA4 property; analytics and crash reports are **separate opt-ins**; **no User-ID** (individual nudge email comes from backend data, a separate work item).

## 1. Audit summary

| Area | Finding |
|---|---|
| Framework | Expo SDK 57, RN 0.86, React Navigation 7; one `src/` for both platforms. `ios/` and `android/` are generated (gitignored); native settings go in config plugins. |
| Identity | Users are keyed by email; no analytics id exists. The auth state clears on sign-out and on a forced 401 sign-out (which skips cleanup callbacks). |
| Before | No analytics, no crash reporting, no screen tracking, no Firebase. Release errors reached only an error boundary and a logger that is silent in production. |
| Mobile-only surfaces | Camera and photo-library receipt capture, camera/photos/notification permissions, `trackspense://` deep links, notification taps. **Not built:** biometrics, offline sync (NetInfo only classifies errors), Google sign-in. None of these is instrumented. |
| Risky inputs | Route params carry merchant names, ids and invite tokens (`MerchantDetail`, `ItemDetail`, `GroupDetail`, `JoinGroup`); error text can carry server detail. Neither may reach a vendor. |
| Store state | Neither app is submitted yet, so these are first disclosures. |

## 2. Architecture

App → features → core (`src/core/boundary.test.ts`). Core is product-agnostic and **template-ready** (see [`CORE_BOUNDARY.md`](../mobile/CORE_BOUNDARY.md)); TrackSpense names live outside it.

| Layer | What | Where |
|---|---|---|
| Core | Client (consent, operations, screens), whole-event validator, providers (`firebase`, `noop`, `recording`), crash reporter + sanitizers, consent store and UI, screen tracker, environment resolver, auth observer, `permission_result` helper | `src/core/analytics/`, `src/core/auth/authObserver.ts` |
| Features | TrackSpense event table (generated from the catalog), typed `track`, confirmed-write wrappers, auth/deep-link mapping | `src/features/shared/analytics/` |
| App | Chooses provider by build environment, registers the auth observer, screen-id registry (`AppConfig.analytics.screens`) | `src/app/analytics.ts`, `src/app/appConfig.ts` |
| Native | Dynamic frameworks, no IDFA, Android ad permissions removed, collection defaults off, env-selected Firebase files | `app.json`, `app.config.js`, `firebaseConfig.js`, `withFirebasePrivacy.js`, `firebase.json` |

Rules: no screen or business code calls Firebase; every provider call is fire-and-forget and isolated; events are validated against the closed table and the whole event is dropped on any unknown key or value; producers wrap API functions so a success is counted only after the server acknowledges it, with one terminal event per operation token; a lost reply is `unknown/outcome_unknown` and is never retried for analytics.

## 3. Mobile event inventory

The catalog marks 34 events for `ios` and `android` (identical on both): 29 shared with web plus 5 mobile-only. Web-only (4): `expense_creation_started` (mobile has no separate intent step), `analysis_viewed`, `expense_filter_applied`, `data_export_completed`.

| Event | Producer (mobile) |
|---|---|
| `screen_view` (mobile-only) | `RootNavigator` → `screenTracker`: one per change of the focused route **name**, mapped to a stable id; params never read; Firebase automatic reporting off |
| `signup_started`, `sign_up`, `signup_failed`, `login`, `login_failed`, `logout` | `AuthContext` → `authObserver` → `features/shared/analytics/auth.ts`. Sign-out is reported only when deliberate (not on 401) |
| `expense_created`, `expense_creation_failed`, `group_expense_created` | `addExpense`, `addExpenseWithItems`, `addGroupExpense`, `addGroupExpenseWithItems` with a capture context from `AddExpenseScreen` (`manual`/`receipt`) and `useQuickLogBar` (`quick_log`) |
| `expense_updated`, `expense_deleted`, `group_expense_updated` | `updateExpense`, `deleteExpense`, `updateGroupExpense`, `deleteGroupExpense` (user-initiated callers only) |
| `category_suggestion_completed/failed/accepted/overridden` | `AddExpenseScreen` suggestion debounce, **one completed-or-failed event per draft**; accepted/overridden ride on the confirmed save |
| `receipt_parse_started/completed/failed` | `AddExpenseScreen.parseReceiptUri`; declining the AI prompt is `cancelled` |
| `receipt_image_selected`, `permission_result` (mobile-only) | `pickReceipt` (source `camera`/`library`); camera, photo and notification permission outcomes, once per outcome per session |
| `group_created`, `group_member_invited`, `group_invitation_accepted`, `settlement_completed` | Group API functions, after acknowledgement |
| `ai_analyst_opened`, `ai_query_started/completed/failed` | Ask tab focus; `sendChatMessageFull` after AI consent |
| `recurring_template_changed`, `recurring_run_completed` | Recurring API functions; run-now counts only `created=true` |
| `deep_link_opened`, `notification_opened` (mobile-only) | `linking.getStateFromPath` and the notification handler; the link/notification **type** only |

Not instrumented because the feature does not exist: biometrics, offline sync, Google sign-in. `notification_opened` stays inactive until push is enabled in builds.

## 4. Consent and identity

**Timing (owner decision, 2026-11-25): consent is asked once at first launch, before sign-in.** This makes registration and sign-in outcomes (`signup_started`, `sign_up`, `signup_failed`, `login`, `login_failed`) and the Login/Register screens measurable for everyone who allowed analytics. Limits that remain: nothing is collected before the answer, so the very first screen view and any deep link opened before the person answers are not reported (the current screen is re-reported when the grant arrives); people who decline are invisible, so web-style funnel formulas still must not be applied to mobile without a coverage note (the share who allowed analytics is not known); closing the sheet counts as declining.

Two independent device-level choices (analytics, crash reports), stored in SecureStore, asked once at first launch with both switches off and equally weighted buttons (closing the sheet declines), changeable in Account → Privacy. Nothing is collected before a grant; withdrawal applies immediately, even if saving fails, and also resets the analytics identity. No User-ID or email-derived value is sent. The Firebase app-instance identity is reset on withdrawal, sign-out, forced sign-out and account change (`AnalyticsLifecycle` follows the session, not the cleanup list). Operations begun before a grant never emit afterwards. The consent answer, including a denial, is pushed to the SDKs at every launch, because both SDKs persist their own setting, and unsent crash reports are discarded whenever crash consent is not granted. Resetting the identity gives the next sign-in a new Firebase app instance, so each sign-in cycle counts as a new user in GA4 (new/total users inflate; cohorts by user are unreliable), and `resetAnalyticsData` may discard a `logout` logged just before it (suspected; verify in DebugView).

## 5. Environments

| `EXPO_PUBLIC_ANALYTICS_ENV` | Behavior |
|---|---|
| unset or anything else | **No Firebase at all** (no config file, no `FirebaseApp.configure()`, no Google Services plugin); disabled clients |
| `qa` | Firebase of the **Dev** project; allowed in development builds (for DebugView); QA-only "Send test crash" control |
| `production` | Firebase of the **Prod** project; refused in development builds |
| any value with `EXPO_PUBLIC_APP_VARIANT=e2e` | Always off |

A `qa` or `production` build must also provide `GOOGLE_SERVICES_PLIST` and `GOOGLE_SERVICES_JSON` (paths; EAS file secrets). The build fails if a file is missing, if the two describe different Firebase projects, if the bundle id/package is not `com.cerebroos.trackspense`, or if `FIREBASE_EXPECTED_PROJECT_ID` is unset or names another project. That variable is **required** (set it per EAS profile: the Dev project id for `qa`, the Prod project id for `production`): without it a production build with the Dev files would pass every other check. A `qa` build is refused on the `production` EAS profile or a push-enabled build, so the Dev project and test-crash control cannot reach a store. The config files are never committed. Jest never reaches Firebase (recording provider).

## 6. Firebase and GA4 runbook — owner actions (none performed)

Do not change the existing production property settings beyond what is listed. Firebase Analytics and Crashlytics need no paid plan; do not enable BigQuery export, ads linking or Performance Monitoring.

1. Create two Firebase projects: **TrackSpense Dev** and **TrackSpense Prod**. Enable Google Analytics for each: Dev linked to the existing non-production GA4 test property; **Prod linked to the existing "TrackSpense Production" property** (Firebase Console → Project settings → Integrations → Google Analytics → link existing).
2. In each project add an iOS app (bundle id `com.cerebroos.trackspense`) and an Android app (package `com.cerebroos.trackspense`). Each app creates its own data stream in the property (iOS and Android stay separate from the web stream). Download `GoogleService-Info.plist` and `google-services.json` per project.
3. Store them as EAS file environment variables exposed as `GOOGLE_SERVICES_PLIST` / `GOOGLE_SERVICES_JSON`, and set `FIREBASE_EXPECTED_PROJECT_ID` to that environment's Firebase project id, in the EAS **preview** environment for Dev and the **production** environment for Prod (`eas.json` has the `qa` and `production` profiles that select them and set `EXPO_PUBLIC_ANALYTICS_ENV`; the app still needs `eas init` before the first EAS build); set `EXPO_PUBLIC_ANALYTICS_ENV` per EAS profile (`qa` → Dev files, `production` → Prod files). Never set `e2e` in a release profile.
4. GA4 Admin → TrackSpense Production: keep Google signals, ads personalization and user-provided data off; set event and user data retention to **2 months** like web; confirm the iOS and Android streams exist; register only the event-scoped dimensions already listed in [`ga4-configuration.md`](ga4-configuration.md) plus `screen_name`, `source`, `permission`, `result`, `link_type`, `notification_type` if reports need them. Add a data filter or `platform` comparison so mobile and web reports can be separated.
5. Crashlytics: enable it in each project (Release → Crashlytics). iOS builds upload dSYMs through the build phase RNFB adds; Android uses the Crashlytics Gradle plugin (mapping upload at release). Keep the dSYM/mapping of every shipped build.
6. DebugView: on a `qa` build, iOS launch argument `-FIRDebugEnabled` (Xcode scheme); Android `adb shell setprop debug.firebase.analytics.app com.cerebroos.trackspense`. Never debug against the Prod project.
7. Apple/Google consoles: complete the disclosures in §9 before submission.

## 7. Crashlytics configuration and validation plan

Collection is off natively and turns on only with the crash opt-in. Reports carry: native crash data, sanitized JS errors (whitelisted error name, fixed code, frames with URLs/emails removed; the message and first stack line never leave the device), attributes `app_version`, `build`, `env`, `platform`, and breadcrumbs that are accepted **event names only**. The SDK's own fatal-error and unhandled-rejection handlers are fronted by sanitizers, because they otherwise record raw messages; in release builds every fatal error is sanitized regardless of consent state (it fails closed: a frozen or non-Error value is replaced, never forwarded), and development builds keep their red box. The SDK also logs its own `app_exception` Analytics event for JS fatals (fatal flag and timestamp, no private data); it is not in the catalog. **Validation (owner-assisted, non-production only):** on a `qa` build with crash reports on, use Account → Privacy → "Send test crash"; relaunch; confirm one crash in the Dev project with the right build/env/platform, a symbolicated native stack (iOS dSYM; Android mapping), no message text, and no breadcrumbs other than event names. Repeat on both platforms. Residual: JS frames are minified (Hermes) unless sourcemaps are uploaded; a native crash that originates in JS reports through RN's native fatal path with the sanitized error.

## 8. Testing and UAT

Release evidence is in `docs/sdlc/work-items/TS-GA4-002/evidence.json`. Native E2E (Maestro) has **not** been re-run since this change; it is release-time evidence per the repo's rules (`make release-prepare`), and the consent sheet and Privacy row are hidden in E2E builds by design.

Deterministic first (Jest, no network): catalog contract (web and mobile), whole-event rejection with canary private values, consent denial/revocation and in-flight operations, identity reset on sign-out/401/account switch, exactly-once screens against a real navigator, confirmed-write producers against a mocked transport (success, 4xx, 5xx, lost reply, retries, withdrawn consent), environment matrix, crash sanitizers, plugin and `firebase.json` assertions. Specification: `docs/sdlc/work-items/TS-GA4-002/test-plan.md` (AN-01…AN-17). Manual per platform (add to the release checklist): consent prompt and Account toggles; DebugView of one run through login, a manual expense, a receipt (camera and library), a group expense and settlement, an Ask question, a deep link; test crash; confirm production receives nothing from a `qa` build. Native E2E (Maestro) is unchanged and runs with analytics off.

## 9. Store disclosure recommendations (not a legal conclusion)

Derived from the code; the owner must verify against Firebase's current "App Store privacy" and "Play Data safety" guidance and the final SDK versions before submitting. Analytics is optional and off until the user opts in; no advertising ID is accessed on either platform, there is no ATT prompt, data is not sold or used for advertising, and nothing is linked to an email or User-ID by the app.

| Store | Likely declarations for the Firebase additions |
|---|---|
| Apple App Privacy | Usage Data → Product Interaction (analytics); Diagnostics → Crash Data and Other Diagnostic Data (app functionality/analytics); Identifiers → Device ID (the SDK's installation/vendor identifier). Not used for tracking. Confirm "linked to user" = No because no User-ID is set. Existing declarations for account, financial and receipt data are separate. |
| Google Play Data safety | App activity → App interactions; App info and performance → Crash logs, Diagnostics; Device or other IDs → app instance id. Mark collection **optional** and processed by a service provider; data encrypted in transit. Deletion: analytics data is pseudonymous and keyed to the app instance (no User-ID), so it cannot be deleted per account; it expires with the 2-month retention. Say this plainly and do not promise per-user deletion. Do not declare the Advertising ID (the permission is stripped). |

**Verified in the Android `qa` Release build (arm64, 2026-11-25):** the merged manifest contains neither `com.google.android.gms.permission.AD_ID` nor any `ACCESS_ADSERVICES_*`; `firebase_analytics_collection_enabled`, `firebase_crashlytics_collection_enabled`, `google_analytics_adid_collection_enabled`, `google_analytics_ssaid_collection_enabled`, `google_analytics_automatic_screen_reporting_enabled` and the `…default_allow_ad_storage` / `ad_user_data` / `ad_personalization_signals` flags are all `false`. One Firebase-related permission remains, `BIND_GET_INSTALL_REFERRER_SERVICE` (Play Install Referrer: install source, not the advertising ID); mention it in the Data safety review. Most other permissions in the merged manifest (launcher badge permissions, `READ_APP_BADGE`) come from `expo-notifications`, not analytics.

**Verified in the iOS `qa` Release build (simulator, 2026-11-25):** `NSPrivacyTracking` is false with no tracking domains; no `NSUserTrackingUsageDescription` (no ATT prompt); `AdSupport` is linked by no binary; Info.plist carries `FIREBASE_ANALYTICS_COLLECTION_ENABLED=false`, `FirebaseCrashlyticsCollectionEnabled=false`, `FirebaseAutomaticScreenReportingEnabled=false` and all four `GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_*`/ad-network flags false. The SDK manifests declare, all **not linked** and **not for tracking**: Crashlytics → Crash Data and Other Diagnostic Data (app functionality); Firebase Installations and GoogleDataTransport → Other Diagnostic Data (analytics). They declare **nothing** for analytics interactions or device identifiers, so the Apple label cannot rely on the manifests: declare Product Interaction and Device ID from Firebase's own disclosure guidance. Re-check with Xcode's archive "Generate Privacy Report" on the real release archive. Update the public privacy policy for the mobile apps (the draft paragraph is in `varavu_selavu_app/privacy_policy.html`; owner/legal review required).

## 10. Shared vs platform-specific work

| Shared (written once) | iOS only | Android only |
|---|---|---|
| Catalog, validator, client, consent, screen tracking, producers, sanitizers, crash reporter, tests, docs | `GoogleService-Info.plist`, dynamic frameworks + no-IDFA pod switch, scene-lifecycle patch keeping `FirebaseApp.configure()`, dSYM upload, Apple disclosure and privacy report, DebugView launch argument | `google-services.json`, Google Services + Crashlytics Gradle plugins, manifest removal of `AD_ID`/`ACCESS_ADSERVICES_*`, mapping upload, Play Data safety, `adb` DebugView property |

## 11. Residual risks and manual verification

- **Real DebugView and test crash on both platforms are not yet run** (needs owner-provided Dev Firebase config). Until they are, delivery, symbolication and the absence of unexpected automatic fields are unverified.
- Automatic SDK metadata (app-instance id, device model, OS, app version, country from IP, `first_open`, `session_start`, `user_engagement`, `app_update`) is collected after opt-in; inspect a real payload and list the fields in the policy.
- Consent is per device, not per account: a second account on the same device inherits the choice until changed in Account → Privacy.
- The consent sheet waits for the recurring-expenses prompt (a small overlay gate in `core/ui/overlayGate.ts`), so the two modals should not stack; confirm on a device (iOS modal presentation, VoiceOver, Android Back). Closing the sheet declines, and a failed save of a choice shows a message.
- `useFrameworks: dynamic` applies to every iOS build (the pods are linked even in builds without Firebase config); cold-start and binary-size cost are **unmeasured**. `setupAnalytics()` constructs the Crashlytics module at start-up in `qa`/`production` builds.
- The Crashlytics installation id is not reset with the analytics identity (no user id is ever set, so nothing links it to a person). Crashlytics keeps crash data for its own retention period (about 90 days per Firebase's documentation; confirm) in addition to GA4's.
- Not yet shown by any capture: that **no network traffic** leaves the app before consent on either platform (Firebase Installations/`FirebaseApp.configure()` behavior). Capture a pre-consent, post-withdrawal and post-forced-crash trace on both platforms before release.
- Timeouts are reported as `network` (not `timeout`); the notification permission's `undetermined` is reported as `denied`; the screen registry is pinned to the catalog by a test, so a new route is invisible to analytics until registered.
- The mobile privacy-policy paragraph is in `varavu_selavu_app/privacy_policy.html`, which the backend serves: deploying the backend publishes it before any mobile release. Owner/legal review it and time it with the first mobile analytics release.
- Minified JS stack frames; Android builds were checked on arm64 only; crash and analytics SDKs add app size even in builds where they are inert.
- Performance Monitoring was not evaluated and is not included.
