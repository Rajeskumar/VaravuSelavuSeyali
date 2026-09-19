# TrackSpense QA — Test Case Inventory

Legend: **Type** = Smoke / Functional / Regression / API / Negative / Security.
**Automated** = Yes unless noted. Parametrized cases (e.g. one test run per route) are
listed as a single row with a "×N" note rather than one row per parameter, to keep this
scannable — see the test file for the exact list.

## Smoke

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| SMOKE-001 | Golden path | Load → login → dashboard → create/verify/edit/verify/delete/verify expense → logout | Critical | Smoke | Yes | `e2e/tests/smoke/smoke.spec.ts` |
| SMOKE-002 | Prod read-only | Homepage loads, returns 2xx, correct title | Critical | Smoke | Yes | `e2e/tests/smoke/prod-readonly.spec.ts` |
| SMOKE-003 | Prod read-only | Login page renders real form (never submitted) | Critical | Smoke | Yes | `e2e/tests/smoke/prod-readonly.spec.ts` |
| SMOKE-004 | Prod read-only | Backend `/healthz` responds 2xx | Critical | Smoke | Yes | `e2e/tests/smoke/prod-readonly.spec.ts` |
| SMOKE-005 | Prod read-only | Backend `/config` reports feature flags | High | Smoke | Yes | `e2e/tests/smoke/prod-readonly.spec.ts` |
| SMOKE-006 | Prod read-only | Unknown route renders app 404, not a 5xx | Medium | Smoke | Yes | `e2e/tests/smoke/prod-readonly.spec.ts` |

## Authentication

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| AUTH-001 | Login | Valid credentials reach the dashboard | Critical | Smoke | Yes | `e2e/tests/smoke/smoke.spec.ts` (golden path's first step — not duplicated in login.spec.ts, see its file-level note) |
| AUTH-002 | Login | Wrong password → generic error, no navigation | Critical | Negative | Yes | `e2e/tests/auth/login.spec.ts` |
| AUTH-003 | Login | Unknown email → same generic error (no enumeration) | High | Security | Yes | `e2e/tests/auth/login.spec.ts` |
| AUTH-004 | Login | Empty credentials do not submit | Medium | Negative | Yes | `e2e/tests/auth/login.spec.ts` |
| AUTH-005 | Login | Unauthenticated visit to `/dashboard` redirects to `/login` | Critical | Functional | Yes | `e2e/tests/auth/login.spec.ts` |
| AUTH-006 | Login | Logged-in visit to `/login` redirects to `/dashboard` | Medium | Functional | Yes | `e2e/tests/auth/login.spec.ts` |
| AUTH-007 | Registration | New account registers and lands on dashboard | Critical | Functional | Yes | `e2e/tests/auth/registration.spec.ts` |
| AUTH-008 | Session | Logged-in session survives a page reload | High | Functional | Yes | `e2e/tests/auth/session.spec.ts` |
| AUTH-009 | Session | Logout clears session, `/dashboard` redirects to `/login` after | Critical | Functional | Yes | `e2e/tests/auth/session.spec.ts` |
| AUTH-010 | API auth | `GET /auth/me` returns the authenticated user | Critical | API | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-011 | API auth | `GET /auth/me` with no credentials → 401 | Critical | API/Negative | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-012 | API auth | Bad password on `/auth/login` → 401 | Critical | API/Negative | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-013 | API auth | Malformed login body → 422, not 500 | High | API/Negative | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-014 | CSRF | State-changing request without `X-CSRF-Token` → 403 | Critical | Security | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-015 | Token | Garbage/forged access token → 401, not silently accepted | Critical | Security | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-016 | Registration | Duplicate email → generic 400 (no enumeration) | High | API/Security | Yes | `api/tests/auth-api.spec.ts` |
| AUTH-017 | Registration | Password under 8 chars → 422 | Medium | API/Negative | Yes | `api/tests/auth-api.spec.ts` |

## Dashboard

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| DASH-001 | Dashboard | Loads without an error state | Critical | Functional | Yes | `e2e/tests/dashboard/dashboard.spec.ts` |
| DASH-002 | Dashboard | Total increases by exactly the amount of a new expense | Critical | Functional | Yes | `e2e/tests/dashboard/dashboard.spec.ts` |
| DASH-003 | Dashboard | Total decreases by exactly the amount of a deleted expense | Critical | Functional | Yes | `e2e/tests/dashboard/dashboard.spec.ts` |

## Expenses

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| EXP-001 | CRUD (UI) | Create via Quick Capture, edit cost + description, delete | Critical | Functional | Yes | `e2e/tests/expenses/expense-crud.spec.ts` |
| EXP-002 | CRUD (UI) | Delete can be cancelled without removing the row | High | Functional | Yes | `e2e/tests/expenses/expense-crud.spec.ts` |
| EXP-003 | CRUD (UI) | API-created expense is visible and openable in the UI | High | Functional | Yes | `e2e/tests/expenses/expense-crud.spec.ts` |
| EXP-004 | Validation (UI) | Save disabled with no amount | High | Negative | Yes | `e2e/tests/expenses/expense-validation.spec.ts` |
| EXP-005 | Validation (UI) | Save disabled with no description | High | Negative | Yes | `e2e/tests/expenses/expense-validation.spec.ts` |
| EXP-006 | Validation (UI) | A 3rd decimal digit cannot be composed | Medium | Negative | Yes | `e2e/tests/expenses/expense-validation.spec.ts` |
| EXP-007 | Validation (UI) | Amount above server ceiling cannot be composed | High | Negative | Yes | `e2e/tests/expenses/expense-validation.spec.ts` |
| EXP-008 | Validation (UI) | Very long description doesn't block save client-side | Low | Negative | Yes | `e2e/tests/expenses/expense-validation.spec.ts` |
| EXP-009 | Search | Exact + partial description search both find the row | High | Functional | Yes | `e2e/tests/expenses/search-filter.spec.ts` |
| EXP-010 | Search | No-match search shows empty state, not stale rows | Medium | Functional | Yes | `e2e/tests/expenses/search-filter.spec.ts` |
| EXP-011 | Search | Special characters don't crash the page | Medium | Negative | Yes | `e2e/tests/expenses/search-filter.spec.ts` |
| EXP-012 | Search | Clearing the search restores the full list | Medium | Functional | Yes | `e2e/tests/expenses/search-filter.spec.ts` |
| EXP-013 | CRUD (API) | Create → read → update → delete round-trip | Critical | API | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-014 | List (API) | `limit`/`offset` pagination is respected | Medium | API | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-015 | Delete (API) | Nonexistent id → 404 | High | API/Negative | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-016 | Delete (API) | Malformed id → 4xx, not 500 | Medium | API/Negative | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-017 | Authorization (API) | Another user cannot delete this user's expense (404) | Critical | Security | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-018 | Validation (API) | Zero / negative / >2-decimal / >ceiling amount → 422 (×4) | Critical | API/Negative | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-019 | Validation (API) | Amount at exactly the ceiling is accepted | High | API | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-020 | Validation (API) | Missing required field → 422 | High | API/Negative | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-021 | Validation (API) | Malformed date → 422 | Medium | API/Negative | Yes | `api/tests/expenses-api.spec.ts` |
| EXP-022 | Validation (API) | Invalid `/analysis` scope value → 422, not 500 | Medium | API/Negative | Yes | `api/tests/expenses-api.spec.ts` |

## Financial calculations

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| CALC-001 | Analysis | Category totals + grand total match a deterministic seed exactly | Critical | API | Yes | `api/tests/analysis-calculations.spec.ts` |
| CALC-002 | Analysis | Deleting an expense removes it from the category total | Critical | API | Yes | `api/tests/analysis-calculations.spec.ts` |
| CALC-003 | Analysis | Updating an amount is reflected in the next analysis call | Critical | API | Yes | `api/tests/analysis-calculations.spec.ts` |
| CALC-004 | Group splits | Equal split on a clean amount divides exactly | Critical | API | Yes | `api/tests/groups-api.spec.ts` |
| CALC-005 | Group splits | Equal split with an odd cent apportions the remainder correctly (largest-remainder rule) | Critical | API | Yes | `api/tests/groups-api.spec.ts` |
| CALC-006 | Group balances | Balances net to exactly zero across all members | Critical | API | Yes | `api/tests/groups-api.spec.ts` |
| CALC-007 | Budgets | `spent`/`remaining` track the same ledger as `/analysis` | Critical | API | Yes | `api/tests/budgets-api.spec.ts` |

## Groups

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| GRP-001 | Create (UI) | New group created and appears in the rail | Critical | Functional | Yes | `e2e/tests/groups/group-splits.spec.ts` |
| GRP-002 | Expenses (UI) | API-created group expense shows up in the group feed | High | Functional | Yes | `e2e/tests/groups/group-splits.spec.ts` |
| GRP-003 | Balances (UI) | Fronting an expense shows "You're owed" with correct amount | Critical | Functional | Yes | `e2e/tests/groups/balances.spec.ts` |
| GRP-004 | Balances (UI) | No expenses → "You're all settled up" | Medium | Functional | Yes | `e2e/tests/groups/balances.spec.ts` |
| GRP-005 | Membership (API) | Create group, add member by email, member appears in roster | Critical | API | Yes | `api/tests/groups-api.spec.ts` |
| GRP-006 | Validation (API) | Exact-split entries not summing to total → 4xx | High | API/Negative | Yes | `api/tests/groups-api.spec.ts` |
| GRP-007 | Validation (API) | Payers not summing to expense amount → 4xx | High | API/Negative | Yes | `api/tests/groups-api.spec.ts` |
| GRP-008 | Authorization (API) | Non-member is rejected from a group's routes with 403 | Critical | Security | Yes | `api/tests/groups-api.spec.ts` |

## Budgets

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| BUD-001 | Create | Creating a 2nd budget for the same (scope, category) edits in place | High | API | Yes | `api/tests/budgets-api.spec.ts` |
| BUD-002 | Validation | Negative amount → 422 | High | API/Negative | Yes | `api/tests/budgets-api.spec.ts` |
| BUD-003 | Not found | Breakdown for nonexistent budget → 404 | Medium | API/Negative | Yes | `api/tests/budgets-api.spec.ts` |
| BUD-004 | Authorization | Another user cannot read this user's budget breakdown | Critical | Security | Yes | `api/tests/budgets-api.spec.ts` |

## Settings

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| SET-001 | Profile | Name change persists after page reload | High | Functional | Yes | `e2e/tests/settings/profile-settings.spec.ts` |
| SET-002 | Profile | Name change persists after navigating away and back | High | Functional | Yes | `e2e/tests/settings/profile-settings.spec.ts` |
| SET-003 | Profile | Email field is read-only | Medium | Functional | Yes | `e2e/tests/settings/profile-settings.spec.ts` |

## Permissions / authorization

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| PERM-001 | Route guard | Every protected route redirects to `/login` when logged out (×5 routes) | Critical | Security | Yes | `e2e/tests/permissions/authorization.spec.ts` |
| PERM-002 | Data isolation | One user's expenses never appear in another user's list/search | Critical | Security | Yes | `e2e/tests/permissions/authorization.spec.ts` |
| PERM-003 | API auth | Unauthenticated `GET` on 5 protected endpoints → 401 (×5) | Critical | API/Security | Yes | `api/tests/negative-api.spec.ts` |

## Negative / error-path (cross-cutting)

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| NEG-001 | Malformed request | Non-JSON body on a JSON endpoint → 4xx, not 500 | High | API/Negative | Yes | `api/tests/negative-api.spec.ts` |
| NEG-002 | Malformed request | Unknown extra field is ignored, not an error | Low | API | Yes | `api/tests/negative-api.spec.ts` |
| NEG-003 | Missing resource | `PUT` on nonexistent expense id → 404 | High | API/Negative | Yes | `api/tests/negative-api.spec.ts` |
| NEG-004 | Missing resource | Balances for nonexistent group → 403, not a 500 | High | API/Negative | Yes | `api/tests/negative-api.spec.ts` |
| NEG-005 | File upload | Wrong-content declared-PNG upload → 415 | High | API/Negative | Yes | `api/tests/negative-api.spec.ts` |
| NEG-006 | File upload | Unsupported file type → 415 | High | API/Negative | Yes | `api/tests/negative-api.spec.ts` |
| NEG-007 | File upload | Oversized upload (>12MB) → 413 | Medium | API/Negative | Yes | `api/tests/negative-api.spec.ts` |

## Regression (migrated + cross-cutting)

| ID | Feature | Scenario | Priority | Type | Automated | Test file |
|---|---|---|---|---|---|---|
| REG-001 | Responsive | No horizontal overflow on 4 primary routes (×4) | High | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-002 | Responsive | No touch target under 44px on 4 primary routes (×4) | High | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-003 | Responsive | No layout-widening truncated text on 4 primary routes (×4) | Medium | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-004 | Responsive | Sidebar collapses to a reachable bottom nav on mobile | High | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-005 | Responsive | Quick Capture sheet fits the viewport, no bleed | Medium | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-006 | Amount bounds | Keypad cannot exceed the server's maximum amount | High | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-007 | Amount bounds | Amount display never overflows its sheet at max digits | Medium | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-008 | Amount bounds | Save stays disabled at a zero amount | High | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-009 | Security | No JWT reachable from page JS (localStorage/sessionStorage/`document.cookie`) | Critical | Security | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-010 | Security | Authenticated requests succeed on cookies alone | Critical | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |
| REG-011 | Security | Logged-out navigation to `/dashboard` redirects to `/login` | Critical | Regression | Yes | `e2e/tests/regression/responsive-mobile.spec.ts` |

---

**Totals**: ~100 automated test cases (counting parametrized cases individually) across 20
spec files. See `qa/README.md` for how to run each category and `qa/TEST-PLAN.md` for
scope, strategy, and documented gaps.
