# Mobile core / features / app boundary

`varavu_selavu_mobile/src/` is split so the reusable shell (`core/`) can be lifted into a CerebroOS
app template without dragging TrackSpense with it.

```
app/        → imports features and core   (TrackSpense's composition)
features/   → imports core (and other features) — never app/
core/       → imports only core and npm packages — never features/ or app/
```

`src/core/boundary.test.ts` fails the build if either rule is broken (it scans `import`, `export … from`,
`require`, dynamic `import()` and `jest.mock()` specifiers, tests included). Imports are relative; there are no path aliases.

## What belongs where

**`core/`** — knows nothing about expenses.
- `theme/` tokens (`theme.ts`, incl. `bootScreen`), `ThemeContext`, fonts.
- `ui/` primitives: buttons, inputs, sheets, toast, skeleton, tabs, `ListRow`, `TypeaheadInput<T>` …
- `auth/` `AuthContext`, `authApi`, `accountApi`, sign-in/register/forgot/security/delete-account screens, `methods/`, `signOutRegistry`, `storageKeys`.
- `api/` `apiFetch` (401 refresh, offline check), `request` (bounded fetch, timeouts), `baseUrl`, generic `fetchConfig<T>`.
- `navigation/` `CoreApp` (the app root), `RootNavigator`, `MainTabs`.
- `notifications/` push registration, device API.
- `config/` the `AppConfig` type, `defaultAppConfig`, `getAppConfig`/`setAppConfig`.
- `analytics/` consent-gated, fail-safe analytics and crash reporting: client, whole-event validator, providers (`firebase`, `noop`, `recording`), sanitizers, consent store/UI, screen tracker. It takes the app's event table and screen registry as data (`configureAnalytics`, `AppConfig.analytics.screens`) and names only the cross-app events (`screen_view`, `permission_result`). Auth outcomes reach the app through `core/auth/authObserver`. TrackSpense's table and producers are in `features/shared/analytics/`.
- `logger.ts` — silent in production; never prints URLs, tokens or response bodies. Use it instead of `console.*` in core.
- `utils/` generic helpers (`identity`).

**`features/<area>/`** — one folder per product area (`expenses`, `receipts`, `groups`, `activity`, `home`,
`insights`, `ask`, `budgets`, `cards`, `tags`, `recurring`, `account`), each with `screens/ components/ hooks/ utils/ api/`.
`features/shared/` holds things several features use that aren't core (the `FeatureFlags` type and `getConfig`).
Features may import each other (e.g. most import `expenses/utils/currencyMath`).

**`app/`** — TrackSpense's wiring: `appConfig.ts` (values for `AppConfig`), `tabs.tsx`, `routes.ts`, `linking.ts`,
`registrations.ts` (sign-out cleanups), `App.tsx` (passes all of it to `CoreApp`).

## Rules of thumb
- If core needs something product-specific, the app passes it in (config value, prop, or registration). Core never reaches out.
- No raw hex/rgba in `core/` outside `theme/theme.ts`; add a token.
- SecureStore key *values* never change (`core/auth/storageKeys.ts`); renaming signs everyone out.
- Route names, deep-link paths and notification payload handling are contracts with the backend and other code.

## How to…

**Add a feature.** Create `features/<name>/…`. Import core with relative paths (`../../../core/ui/Card`). Add its screen to
`app/routes.ts` (pushed screen) or `app/tabs.tsx` (tab). A backend feature flag? Extend `features/shared/featureFlags.ts`.

**Add a tab.** Add `{ name, component, label }` to `app/tabs.tsx`, extend `app/TabBarIcon.tsx` for its icon, and add the
route name to `FAB_TABS` if the floating action should show there. Keep existing route names.

**Add a sign-out cleanup.** In `app/registrations.ts`: `registerSignOutCleanup(() => clearMyState(), 'before' | 'after')`.
`'before'` runs while the token is still valid; `'after'` once tokens are gone. They run on an explicit sign-out only,
never on a forced 401 sign-out (drafts must stay recoverable).

**Account isolation (TS-SEC-101).** Server data lives in one `QueryClient` per signed-in session
(`core/auth/SessionQueryProvider`, mounted by `CoreApp` inside `AuthProvider`); it is replaced on explicit and forced
sign-out, so query keys need not carry the user and a late mutation cannot write into the next account's cache. A request
that can outlive the session (password change, export, share) captures `sessionGuard()` from `core/auth/session` when it
starts and checks it before writing tokens or showing data; token writes go through `runTokenWrite`/`writeTokensIfSession`
so a sign-out cannot land between two SecureStore writes. A session ends when sign-out starts (explicit or 401) and a new
sign-in is a new session; a token refresh is not. Only `AuthProvider` calls `advanceSession()`.

**Add a sign-in method.** Add its id to `AuthMethodId` (`core/config/appConfig.ts`), create `core/auth/methods/<id>.tsx`
exporting an `AuthMethod` (`{ id, Form }`, where `Form` returns a fragment of controls and calls `useAuth()`), register it in
`core/auth/methods/index.ts`, and list the id in `AppConfig.auth.methods`. Only `password` exists today.

**Per-app config.** Everything in `AppConfig` (brand copy, API base URL and timeout overrides, session-ended notice,
delete-account text, Android channel name) lives in `app/appConfig.ts`. `CoreApp` registers it before first render.

**Add a request timeout override.** `AppConfig.api.timeoutOverrides: [{ pattern: /\/path/, ms }]` (default 30 s).
