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
- OCR is the local `modules/receipt-ocr` Expo module. Push entitlement is stripped unless `TRACKSPENSE_ENABLE_PUSH=1` (`withDisablePush.js`); iOS 27 needs `withSceneLifecycle.js`.

## Commands (from repo root)
`make typecheck-mobile` · `make test-mobile` · `make audit-mobile` · `scripts/quality/verify.sh` · bundle check: `cd varavu_selavu_mobile && npx expo export --platform ios --output-dir <tmp>`.
