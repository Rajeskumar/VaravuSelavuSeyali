# AGENTS.md — varavu_selavu_mobile

Expo SDK 57 / React Native 0.86 / React Navigation 7 client for TrackSpense. Root `AGENTS.md` rules apply (plan first, tests with every change, web ↔ mobile parity, leave changes uncommitted unless asked). This file only describes the mobile layout.

## Structure (`src/`)
- `core/` — reusable, product-agnostic shell: `theme/`, `ui/`, `auth/` (+ `methods/`), `api/`, `navigation/` (`CoreApp`), `notifications/`, `config/` (`AppConfig`), `logger.ts`, `utils/`.
- `features/<area>/` — `expenses, receipts, groups, activity, home, insights, ask, budgets, cards, tags, recurring, account, shared`, each with `screens/ components/ hooks/ utils/ api/`.
- `app/` — TrackSpense composition: `appConfig.ts`, `tabs.tsx`, `routes.ts`, `linking.ts`, `registrations.ts`, `App.tsx`. `index.js` registers `src/app/App`.

**Direction is app → features → core.** `core` must not import `features` or `app`; `features` must not import `app`. `src/core/boundary.test.ts` enforces it. Imports are relative (no aliases). Details and "how to add a feature / tab / sign-out cleanup / sign-in method": `../docs/mobile/CORE_BOUNDARY.md`.

## Conventions
- Product-specific values reach core through `AppConfig`, props or registrations — never an import.
- Core: no `console.*` (use `core/logger`), no raw colors outside `core/theme/theme.ts`, SecureStore keys only from `core/auth/storageKeys.ts` (values are persisted; never rename).
- Route names, `trackspense://` deep-link paths and notification payload handling are contracts — keep them.
- Auth: Bearer requests with `credentials: 'omit'` (see root AGENTS.md).
- Native E2E selectors: `testID` is a test contract with `qa/mobile` (Maestro), named `<screen>.<element>` (`login.email`, `tabs.Expenses`, `addExpense.save`). Add one only where a flow interacts; never rename or remove one without updating the flows (`src/e2eSelectors.test.ts` fails if a flow references a missing id).
- OCR is the local `modules/receipt-ocr` Expo module. Push entitlement is stripped unless `TRACKSPENSE_ENABLE_PUSH=1` (`withDisablePush.js`); iOS 27 needs `withSceneLifecycle.js`.

## Commands (from repo root)
`make typecheck-mobile` · `make test-mobile` · `make audit-mobile` · `make check` · bundle check: `cd varavu_selavu_mobile && npx expo export --platform ios --output-dir <tmp>`.

## Key Decisions
- **Analytics and crash reporting (Firebase, TS-GA4-002)**: one shared layer for iOS and Android, details in `../docs/analytics/mobile.md`. Never call Firebase from screens or features; use `features/shared/analytics/operations.ts` (`track`, confirmed-write wrappers) and add an event only to `docs/analytics/catalog.v1.json` + `features/shared/analytics/events.ts` (a Jest contract test fails on drift). Properties are closed enums: no ids, amounts, text, route params or error messages. Two separate opt-ins (analytics, crash reports); nothing is collected before a grant. Firebase is linked only when `EXPO_PUBLIC_ANALYTICS_ENV` is `qa` or `production` (never with the `e2e` variant) and `GOOGLE_SERVICES_PLIST`/`GOOGLE_SERVICES_JSON` point at config files that are never committed. `ios.useFrameworks` is `dynamic` (React Native Firebase requires it); `withSceneLifecycle.js` must keep Firebase's generated `FirebaseApp.configure()` block.
- **Expo SDK 57 / React Native 0.86 / React Navigation 7 needs Xcode 26.4+** (older Xcode fails compiling `expo-modules-jsi`). Minimum iOS is 17.0, set by `expo-build-properties` in `app.json` (SDK 57's precompiled modules target 17.0). In RN 7, navigate to a tab from outside `MainTabs` via `navigate('MainTabs', { screen, params })`, never by bare tab name. TypeScript 6 needs `"types"` set explicitly in `tsconfig.json`. iOS 27 kills apps without the UIScene life cycle; `withSceneLifecycle.js` adopts it — drop it on an SDK whose template does (58+).
- **`npm audit` is gated at high with an allowlist** (`audit-allowlist.json`, checked by `scripts/check-audit.js` via `make audit-mobile`). Only add an advisory with no patched release that reaches only build/test tooling, with a reason and a `reviewBy` date. Never force-fix audits: it "fixes" them by downgrading Expo (the guard hook denies it).
- **OCR uses the local Expo module, not `@react-native-ml-kit`** — ML Kit's iOS pods break arm64 simulator builds.
- **iOS push entitlement is stripped by default** (`withDisablePush.js`, so free personal-team builds sign); release builds must set `TRACKSPENSE_ENABLE_PUSH=1`.
- **Store IDs are `com.cerebroos.trackspense` (iOS and Android) and must never change.**
- **Sheets/modals must not collapse into one iOS accessibility element.** A sheet panel (the `Pressable` that swallows backdrop taps) and its backdrop are `accessible={false}` (`focusable={false}` on the panel); never give a backdrop an `accessibilityLabel`/`accessibilityRole` (it swallows the sheet's rows); put `onAccessibilityEscape` (VoiceOver two-finger Z) on an *ancestor* of the content. `src/core/ui/sheetAccessibility.test.ts` scans every backdrop and panel, so a new sheet that forgets fails Jest.
- **Native E2E build variant (`EXPO_PUBLIC_APP_VARIANT=e2e`)**: the only way a non-dev build may use `EXPO_PUBLIC_API_URL`, and then only for a local test backend origin (`core/api/baseUrl.ts` throws otherwise). `withE2eVariant.js` refuses it for EAS and push-enabled (release) builds and adds Android cleartext (app-wide, as the manifest cannot scope it to one host; the API origin is pinned by `baseUrl.ts`) only for it. Never set the variant in a release/EAS profile; production builds ignore the override. Suite and rules: `qa/mobile/README.md`.
