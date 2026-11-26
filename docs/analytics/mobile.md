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

## 6. Firebase and GA4 setup — step by step

These are owner-run instructions; console setup and delivery verification have **not** been performed by the agent. Start with **Dev**. Production setup can wait until Dev works on both platforms. Console labels may vary slightly.

### 6.1 Choose the destinations before creating anything

| Environment | Firebase project | GA4 property | Apps inside the Firebase project |
|---|---|---|---|
| QA / local analytics testing / TestFlight testing | TrackSpense Dev (reuse if present) | Existing non-production test property; create one dedicated test property only if none exists | iOS + Android |
| Production store release | TrackSpense Prod (reuse if present) | **Existing TrackSpense Production** | iOS + Android |

Both production apps belong to the **same** Firebase project and the existing production GA4 property, alongside the existing web stream. Dev must never link to that production property.

1. Open [Google Analytics](https://analytics.google.com/), select **TrackSpense Production**, then **Admin → Property details**. Record its numeric **Property ID** and account name. The web measurement ID (`G-X3QFP5HNK2`) is not this property ID and does not go into the mobile app.
2. Check **Admin → Product links → Firebase links**. If already linked, use that Firebase project; do not unlink it or create a competing project. Check the test property the same way.
3. Use an account with Firebase project administration access and sufficient GA4 access (Editor or above; property creation also needs account permissions). If the expected property is missing from the picker, check access and existing links before creating anything.

Google supports one Firebase project per linked GA4 property. Linking also grants Analytics access to Firebase-linked roles; review that access. See [Google's linking instructions](https://support.google.com/analytics/answer/9289234?hl=en).

### 6.2 Create or reuse Firebase projects and link GA4

Repeat for Dev first, then Prod when ready:

1. Open [Firebase Console](https://console.firebase.google.com/). Open the existing appropriate project, or select **Create a project**.
2. For a new project use display name **TrackSpense Dev** or **TrackSpense Prod**. Record the actual **Project ID** shown by Firebase (globally unique, e.g. `trackspense-dev-xxxxx`); display names and project numbers are not substitutes.
3. For a new project, turn **Google Analytics off during project creation**, then create the project. This avoids accidentally accepting a new default Analytics property. We enable it against the selected existing property next.
4. Open the gear beside Project Overview → **Project settings → Integrations → Google Analytics → Link** (or Enable). Select the existing Analytics account, then the intended existing property. Verify the numeric property ID before confirming. For Dev only, create a test property if there is genuinely no suitable one.
5. Reopen the integration and confirm the destination. Record the Firebase Project ID and GA4 Property ID together.

Use the no-cost Spark plan for this integration. Do not enable Firestore, Firebase Authentication, Storage, Functions, BigQuery export, ads integrations or Performance Monitoring. Firebase creates a Google Cloud project when a new Firebase project is created, but this does not migrate or reconfigure the existing backend.

### 6.3 Register iOS and Android in each project

In **Project settings → General → Your apps**, choose **Add app**. Register both platforms, even if initially testing only one: this repository validates both config files for every enabled build.

| Field | iOS registration | Android registration |
|---|---|---|
| Bundle ID / Android package name | `com.cerebroos.trackspense` | `com.cerebroos.trackspense` |
| Suggested nickname in Dev | TrackSpense iOS Dev | TrackSpense Android Dev |
| Suggested nickname in Prod | TrackSpense iOS Prod | TrackSpense Android Prod |
| Optional field | App Store ID: leave empty if not available | SHA-1: not required for Analytics/Crashlytics |
| Download | `GoogleService-Info.plist` | `google-services.json` |

Click **Register app**, download the file, and finish the wizard. The SDK/plugin implementation is already in this repository: **do not add the wizard's Swift Package Manager, Podfile, AppDelegate or Gradle snippets manually**. Use our Expo configuration. This requires a rebuilt native app; Expo Go cannot load these native modules. See [React Native Firebase's Expo integration](https://rnfirebase.io/).

Save files outside Git, keeping Dev and Prod separate, for example:

```text
~/.config/trackspense/firebase/dev/GoogleService-Info.plist
~/.config/trackspense/firebase/dev/google-services.json
~/.config/trackspense/firebase/prod/GoogleService-Info.plist
~/.config/trackspense/firebase/prod/google-services.json
```

Downloads can be retrieved later from **Project settings → General → Your apps → selected app**. Do not download service-account private keys: none are needed. GA4 **Admin → Data streams** should show separate iOS and Android streams for the linked project; preserve the existing web stream. Check their app identifiers. Do not create a web Firebase app for this integration.

### 6.4 Configure and check a local QA build

In a new terminal, substitute your **actual Dev project ID**:

```sh
cd /Users/rajeshkumarganesan/Documents/workspaces/VaravuSelavuSeyali/varavu_selavu_mobile
export EXPO_PUBLIC_ANALYTICS_ENV=qa
export FIREBASE_EXPECTED_PROJECT_ID='REPLACE_WITH_DEV_PROJECT_ID'
export GOOGLE_SERVICES_PLIST="$HOME/.config/trackspense/firebase/dev/GoogleService-Info.plist"
export GOOGLE_SERVICES_JSON="$HOME/.config/trackspense/firebase/dev/google-services.json"
unset EXPO_PUBLIC_APP_VARIANT
unset TRACKSPENSE_ENABLE_PUSH
unset EAS_BUILD_PROFILE
node -e 'const r = require("./firebaseConfig").resolveFirebase(process.env); console.log({enabled: r.enabled, mode: r.mode})'
```

Expected output: `{ enabled: true, mode: 'qa' }`. This validates local file/project matching only; it does not prove a GA4 link or event delivery. A mismatch is a stop condition—correct the files/ID, never bypass the guard. These shell exports do not edit the backend `.env`.

**Backend isolation is separate:** `qa` selects the analytics destination, not the API server. In Debug builds, set `EXPO_PUBLIC_API_URL` to an already-running isolated test backend (iOS simulator: `http://127.0.0.1:<port>`; Android emulator: `http://10.0.2.2:<port>`). Use synthetic accounts. Ordinary Release builds ignore that override and use the configured backend; do not run synthetic expense/receipt workflows in a Release QA build until its API destination is independently verified. The `e2e` variant cannot be used for Firebase testing because it disables Firebase.

With dependencies/toolchains installed and the test API configured, generate native configuration and build **in the same terminal**:

```sh
npx expo prebuild
npx expo run:ios
# For Android, set EXPO_PUBLIC_API_URL to the emulator-accessible test API first:
npx expo run:android
```

Prebuild modifies generated native projects. Preserve any local native work first or use an isolated checkout; do not casually use `--clean`. If native projects already exist from a non-Firebase build, a Metro reload alone is insufficient—prebuild/rebuild is required. Keep the exports in any terminal starting Metro for this build. QA and production currently share package identifiers, so installing one replaces the other on a device; use dedicated test simulators/emulators/devices.

### 6.5 EAS cloud configuration (optional for initial testing)

Local Firebase testing does not require EAS. If using cloud builds later, associate this app with the intended Expo project via `eas init` and review the resulting project association before building. In **Expo dashboard → project → Environment variables**, configure:

| Variable | `preview` environment (`qa` profile) | `production` environment |
|---|---|---|
| `GOOGLE_SERVICES_PLIST` | File: Dev plist | File: Prod plist |
| `GOOGLE_SERVICES_JSON` | File: Dev JSON | File: Prod JSON |
| `FIREBASE_EXPECTED_PROJECT_ID` | Text: actual Dev Project ID | Text: actual Prod Project ID |

Use secret visibility for uploaded files. `eas.json` already selects `preview` for `qa`, `production` for `production`, and sets `EXPO_PUBLIC_ANALYTICS_ENV` appropriately. Do not add conflicting account-level variables.

**Repository-specific caveat:** the config resolver opens both files during local EAS configuration evaluation. Secret file variables exist on the cloud worker, not locally. Keep the matching local file exports from §6.4 available to the CLI as well; for a production invocation use the Prod files, Prod project ID and `EXPO_PUBLIC_ANALYTICS_ENV=production`. Remote secret files alone are insufficient for this resolver. Verify the selected environment before uploading. See [Expo's environment variable behavior](https://docs.expo.dev/eas/environment-variables/usage/).

The existing `qa` profile is internal distribution, not an iOS simulator profile. It also does not change the backend destination. Do not use the production profile for TestFlight analytics testing; a dedicated QA distribution configuration must retain the Dev analytics destination. Store releases and production builds remain separate authorized steps.

### 6.6 Verify Analytics in Dev

1. Open the **Dev** Firebase project → **Analytics → DebugView** (or the test GA4 property's Admin → DebugView).
2. iOS: open the generated `.xcworkspace` in Xcode → **Product → Scheme → Edit Scheme → Run → Arguments → Arguments Passed On Launch**; add `-FIRDebugEnabled`. Run the QA app using that scheme.
3. Android: with the intended emulator/device selected, run:

   ```sh
   adb shell setprop debug.firebase.analytics.app com.cerebroos.trackspense
   ```

4. Launch the QA app. Before accepting analytics, check for unexpected events/traffic. Opt into **analytics** on the first-launch sheet or in **Account → Privacy**; crash consent is independent. Navigate between screens. DebugView should show stable `screen_view` names without route IDs or user content. Continue the synthetic workflows in §8 only against the isolated backend.
5. Check each event's properties against the catalog, check screen duplicates, then revoke analytics and verify collection stops. Check both platforms independently and confirm production receives no QA events. DebugView alone cannot prove absence of pre-consent network traffic; retain the network-capture gate in §11.
6. Clean up: remove the iOS debug argument (use `-FIRDebugDisabled` when disabling debug mode), and on Android run:

   ```sh
   adb shell setprop debug.firebase.analytics.app .none.
   ```

Use [Firebase's DebugView instructions](https://firebase.google.com/docs/analytics/debugview). Debug events are excluded from normal aggregate reporting, so DebugView testing does not establish ordinary report delivery. Newly linked products can also take time to synchronize; do not repeatedly change project links to diagnose a delay.

### 6.7 Enable and verify Crashlytics in Dev

1. In the Dev Firebase project, open **Run / Release & Monitor → Crashlytics** and select the registered app. There is no separate per-app enable switch: the SDK is included by the native build, and the dashboard becomes active after the first consented crash report. If the console offers **Get started**, follow the setup view but do not add duplicate SDK code. Repeat verification for the other platform.
2. Build the **QA Release** configuration for iOS (`npx expo run:ios --device --configuration Release` with the Dev Firebase exports from §6.4). React Native Firebase 27 disables `crash()` in iOS Debug builds unless `crashlytics_debug_enabled` is enabled in native config; user consent alone cannot bypass that Debug gate. Keep native auto collection off. Enable **Crash reports** in Privacy, stop/detach the Xcode debugger, launch the installed app from the iPhone home screen, then use **Send test crash**. The app should terminate. This QA Release build uses the configured production API, so do not create synthetic financial records in it.
3. Relaunch the app with network available and crash consent still enabled so the pending report can upload. Look for it under the correct Dev app/version. Allow several minutes; if absent, inspect SDK/build logs and configuration rather than repeatedly crashing.
4. Confirm useful symbolicated frames. For iOS, inspect the RNFirebase-generated Crashlytics upload build phase and any missing-dSYM warning; retain the matching archive/dSYM. For Android, inspect Crashlytics Gradle upload tasks and mapping upload when minification is enabled. Java/Kotlin mapping does not symbolicate native C++ or Hermes JS frames; missing native/JS symbols remain a separate validation gap.
5. Inspect diagnostic keys, native exception text and breadcrumbs for sensitive data. App-added diagnostics are sanitized, but native SDK crash payloads must still be reviewed. Test crash consent denial/revocation separately. Record per-platform results in TS-GA4-002 evidence and re-review after this testing.

See [Firebase's controlled iOS crash procedure](https://firebase.google.com/docs/crashlytics/ios/test-implementation). Native E2E remains deferred per the owner's instruction.

### 6.8 Production readiness and handoff

After Dev validation, repeat registration/link verification for Prod. In the production GA4 property's **Admin**, review Data collection (Google signals/user-provided data off), advertising personalization (off), Data retention (2 months for applicable event/user-level data), and the existing [GA4 configuration checklist](ga4-configuration.md). This retention setting is not a promise that all aggregate Analytics or Crashlytics data disappears after two months. Use **Platform** or stream comparisons to separate web/iOS/Android reports; do not introduce exclusion filters merely to view them separately. Add custom dimensions only when required by the shared reporting specification.

Before release, finish §9 store disclosures, policy review, symbolication and privacy captures. SDK configuration alone does not establish privacy compliance. Production console changes and app release are not performed by following the local preflight.

**Production build preflight (2026-11-25):** `trackspense-prod-191ae` iOS and Android files were validated; an unsigned iOS Release device artifact compiled successfully with the production plist, collection defaults off, and production push entitlement requested. This is a local build, not an App Store signed archive or release. A later Personal Team device install with `TRACKSPENSE_ENABLE_PUSH=1` failed signing because its profile lacks Push Notifications. For a local signed production analytics smoke test, regenerate iOS with `TRACKSPENSE_ENABLE_PUSH` **unset** and use `npx expo run:ios --device --configuration Release`; this keeps the production Firebase destination but disables push notifications in that local install. The actual store archive must keep push enabled and use an Apple Developer provisioning profile with that capability. The production GA4 link and console privacy settings still need owner verification. Earlier Dev testing remains separate.

### 6.9 Troubleshooting

| Symptom | Check |
|---|---|
| Existing GA4 property not offered | Correct account, permissions, numeric property ID, and whether already linked to another Firebase project; do not create a duplicate as a workaround |
| Build rejects Firebase configuration | Both files exist; both are Dev or both Prod; exact bundle/package; expected project ID matches; QA is not push-enabled or using the production profile |
| Firebase native module/default app missing | Native rebuild with enabled config, not Expo Go or a stale native binary |
| No DebugView events | Dev destination, debug flag, analytics consent, `qa` environment compiled into bundle, device connectivity; check the selected DebugView device |
| No crash report | Crash consent, debugger detached, relaunch after crash, correct Firebase app/build, upload logs |
| Unsymbolicated crash | Matching dSYM/mapping and successful upload; JS/native frames require their own symbols |

## 7. Crashlytics configuration and validation plan

Collection is off natively and turns on only with the crash opt-in. Reports carry: native crash data, sanitized JS errors (whitelisted error name, fixed code, frames with URLs/emails removed; the message and first stack line never leave the device), attributes `app_version`, `build`, `env`, `platform`, and breadcrumbs that are accepted **event names only**. The SDK's own fatal-error and unhandled-rejection handlers are fronted by sanitizers, because they otherwise record raw messages; in release builds every fatal error is sanitized regardless of consent state (it fails closed: a frozen or non-Error value is replaced, never forwarded), and development builds keep their red box. The SDK also logs its own `app_exception` Analytics event for JS fatals (fatal flag and timestamp, no private data); it is not in the catalog. **Validation (owner-assisted, non-production only):** on an iOS `qa` Release build with crash reports on, use Account → Privacy → "Send test crash"; relaunch; confirm one crash in the Dev project with the right build/env/platform, a symbolicated native stack (iOS dSYM; Android mapping), no message text, and no breadcrumbs other than event names. Repeat on both platforms. Residual: JS frames are minified (Hermes) unless sourcemaps are uploaded; a native crash that originates in JS reports through RN's native fatal path with the sanitized error.

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

- **iOS Dev DebugView delivery observed by owner on a connected iPhone (2026-11-25):** `screen_view` appeared three times alongside Firebase `first_open`, `session_start`, and `user_engagement`; `non_personalized_ads=1` was visible. This confirms basic iOS delivery only. The QA Release test produced two iOS Crashlytics reports, but the dashboard marked them unprocessed pending one dSYM. The matching local Release-iphoneos app dSYM was submitted to the Dev iOS app (arm64 UUID E72E5E69-64CF-360E-96AD-D1EC0BCB2C61); the owner then confirmed two processed crashes with `RNFBCrashlyticsModule crash` in a readable stack (app 1.0.0 build 1, iOS 27.2.1, iPhone 12 Pro Max). Keys, breadcrumbs and native automatic payload still need privacy inspection. Event parameter values, consent-denied behavior, business events and all Android delivery/symbolication remain unverified.
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
