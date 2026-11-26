# 10 — Release Coverage Map

TS-QA-104 · rows W-14, 21, 25..27, 29 updated by TS-QA-105 (those tests were run) · checked 2026-11-26 against `1c6b4f9` plus the uncommitted working tree.
One row per web route, dialog or flow and per mobile screen or flow. This replaces `05` as the current view of coverage; `05` stays as the audit-time record.

**Method and limits.** Routes come from `App.tsx`, mobile screens from `core/navigation` and `app/{routes,tabs}`. Automated status comes from reading Playwright test **titles** (and spec setup lines for group flows) and Maestro flow steps. **No test was run.** Lower-layer entries are matched by test **file name**; their bodies were not reviewed. So `UI` means "a UI test claims this", not "verified passing or complete". Dialog and sheet rows are grouped by the flow that opens them.

| Status | Meaning |
|---|---|
| **UI** | A browser (web) or Maestro (mobile) test drives the main path |
| **PART** | A UI test covers only part; the gap column says what is missing |
| **STUB** | UI test against a faked server or provider; the real integration is unproven |
| **LOWER** | Only unit, component or API tests found; no UI journey |
| **NONE** | No automated test found |

Gap priority: **P0** money, data loss, sign-in, privacy or isolation · **P1** main feature · **P2** minor. `SMK` is the manual step in `11-release-test-sheet.md`.

## Web

| ID | Route / flow | UAT | Status | Evidence → gap | Pri | SMK |
|---|---|---|---|---|---|---|
| W-01 | `/` home | — | PART | prod read-only smoke, phone layout, axe → CTAs, FAQ | P2 | W1 |
| W-02 | `/login`, `/ai/reauth`: password | AUTH-001..004 | UI | `smoke`, `login.spec` → reauth route | P0 | W1 |
| W-03 | Google sign-in / sign-up | none | LOWER | `GoogleSignInButton.test` | P0 | R1 |
| W-04 | `/register` | AUTH-007..009 | UI | `registration`, `auth-forms` | P0 | R2 |
| W-05 | Logout, session restore, route guards, refresh failure | AUTH-005, 006, 013 | UI | `session`, `session-guards` (refresh stubbed) | P0 | W1, W12 |
| W-06 | `/forgot-password`, `/reset-password` | AUTH-010, 011 | PART | uniform reply, bad token → **a successful reset** | P0 | R2 |
| W-07 | `/verify-email`, verify banner and prompt | AUTH-012 | PART | invalid token → valid link, resend | P1 | R2 |
| W-08 | `/dashboard` | none dedicated | PART | totals follow add/delete → scope toggle values, cards, links, checklist | P1 | W3 |
| W-09 | Header type-to-log bar | none | LOWER | `quickLogParse.test` | P1 | W2 |
| W-10 | Side/bottom nav, deep links, redirect shims, 404 | NAV-001, 002 | PART | phone bottom nav, `/profile` shim; 404 only in prod smoke → desktop nav, other shims | P1 | W12 |
| W-11 | Quick Capture: personal expense and validation | EXP-001..003, 011 | UI | `expense-crud`, `expense-validation`, `mobile-usability` | P0 | W2 |
| W-12 | Quick Capture: double-click, lost connection, draft | EXP-004..007 | PART | `quick-capture-recovery` → 500/timeout, leave-page prompt unasserted by title | P0 | — |
| W-13 | Quick Capture: merchant, tags, card, date limits, category suggestion | EXP-008..010 | LOWER | backend categorization and date-window tests | P0 | W2 |
| W-14 | Quick Capture "Who was this with?" → group expense | none | UI | `group-expense-create`: dashboard capture, equal split → other splits from the dashboard (same split editor) | P0 | W5 |
| W-15 | Merchant/item suggestions (flag off in CI) | none | LOWER | `AddExpenseForm.test`, entity-resolution API | P2 | — |
| W-16 | Receipt scan → itemized personal expense | RCPT-001..006 | STUB | `receipt-scan` (mock OCR), upload limits → PDF, HEIC, real reading | P0 | R3 |
| W-17 | Receipt items split inside a group | none | LOWER | `ItemSplitBoard.test` | **P0** | W5 |
| W-18 | Expense list: search, month filter, CSV, bulk tag | EXP-012, 013, 017, 018 | PART | `search-filter`, `filters-export` → tag filter, scope tabs | P1 | W4 |
| W-19 | Expense list paging | EXP-019 | LOWER | API pagination only | P1 | — |
| W-20 | Edit / delete expense | EXP-014..016 | UI | `expense-crud`, `smoke`, `dashboard` | P0 | W4 |
| W-21 | Move expense to a group | none | UI | `group-expense-lifecycle`: moved in place, equal split → other splits on move | P0 | W5 |
| W-22 | Recurring: run now, pause, delete, due prompt | REC-002..005 | UI | `recurring` (templates created by API) | P0 | W9 |
| W-23 | Recurring: add / edit form, group template | REC-001 | LOWER | backend recurring tests | P1 | W9 |
| W-24 | Create group | GRP-001 | UI | `group-splits` | P0 | W5 |
| W-25 | Add member (registered or placeholder) | GRP-002, 003 | UI | `group-expense-create`: registered email, unregistered email invite, name only (no mail is sent) | P0 | W5 |
| W-26 | **Add a group expense in the group page** | GRP-004..006 | UI | `group-expense-create`: five split methods, excluded member, invalid and stale split, other and multiple payers; pre-filled Exact and Percentage save as they are (TS-FIX-101) | P0 | W5 |
| W-27 | Edit / delete group expense, comments, history, settle share | GRP-007 | PART | `group-expense-lifecycle`: rename, amount change, history, delete, delete and Undo, comments, settle share → date/category edit, itemized edit | P0 | W6 |
| W-28 | Balances and suggested, partial, over settle-up | GRP-008 | UI | `balances`, `settle-up` | P0 | W7 |
| W-29 | Custom settlement, undo settlement | GRP-009 | UI | `group-expense-lifecycle`: custom settlement and same-person block. **No UI undoes a settlement** (API only), so there is nothing to drive | P0 | W7 |
| W-30 | Group settings: members, roles, simplify, mute, export, leave, archive, delete | GRP-011, 013 | LOWER | component and API tests; one phone layout test | **P0** | W8 |
| W-31 | People tab, Activity tab | none | LOWER | `ActivityFeed.test`, friend-balances API | P1 | W8 |
| W-32 | `/groups/join/:token` | GRP-012 | PART | `invite-accept` → log in, then resume | P1 | R2 |
| W-33 | Non-member and cross-account isolation | GRP-010 | PART | API 404, `authorization.spec` (personal expenses); web account-switch is Jest only | P0 | W12 |
| W-34 | Analysis overview: totals, category rows, month/year | ANL-001..003 | PART | `analysis-budgets-cards` → group shares, tag filter, money flow, month picker | P0 | W10 |
| W-35 | "What changed", "Ask about it" | none | LOWER | change-insight tests | P2 | W10 |
| W-36 | Analysis Items and Merchants, detail, price history | ANL-004 | LOWER | `ItemsTab.test`, `MerchantsTab.test` | P1 | W10 |
| W-37 | Budgets | BUD-001, 002 | PART | overall create, delete → category, edit, thresholds, rollover, "Ask why" | P1 | W10 |
| W-38 | Card Coach | CARD-001 | PART | catalog add/remove → custom card, default, rewards, report | P2 | W10 |
| W-39 | `/ask` | ASK-001..004 | STUB | `ask-stubbed` → real answer, off-topic refusal, AI-created expense | P0 | R4 |
| W-40 | Ask side panel | none | LOWER | `AskOverlay.test` | P2 | R4 |
| W-41 | Account: name | ACC-001 | PART | `profile-settings` → phone, payment handles | P1 | W11 |
| W-42 | Account: tag management and bulk apply | none | LOWER | tag API tests | P1 | W11 |
| W-43 | Change password, session list, export, delete account | ACC-002..005 | PART | `account-security` → sign out all devices | P0 | W11 |
| W-44 | Assistants: manage, approve | MCP-002 | STUB | `assistants-stubbed` | P0 | R5 |
| W-45 | `/ai/connect/:id` consent and real OAuth | MCP-001 | LOWER | backend MCP/OAuth, `AssistantAccessPage.test` | P0 | R5 |
| W-46 | `/contact` | none | PART | axe only → submitting the form | P2 | W11 |
| W-47 | Feedback dialog, Help, Privacy, Terms links | none | NONE | | P2 | W11 |
| W-48 | Cookie banner and analytics consent | RESP-002 | PART | phone layout in CI. `qa/analytics/foundation.spec.ts` exists but no CI job or script reference was found | P0 | W12 |
| W-49 | Phone layout, dark mode, accessibility | RESP-001..003, A11Y-001, 002 | PART | responsive specs, axe → keyboard-only journey, screen reader | P1 | W12, R7 |
| W-50 | Error screen (reload) | none | NONE | | P2 | — |

## Mobile (iOS and Android; one code base)

Maestro runs are local and only at release when mobile code changed. A backend-only change does not require them (`qa/mobile/README.md`).

| ID | Screen / flow | Status | Evidence → gap | Pri | SMK |
|---|---|---|---|---|---|
| M-01 | Login, wrong password, session restore | UI | `login-relaunch` | P0 | M1 |
| M-02 | Register | LOWER | auth tests only | P0 | R2 |
| M-03 | Forgot password | NONE | | P0 | R2 |
| M-04 | Sign out, account switch isolation | UI | `account-switch`, session Jest | P0 | M10 |
| M-05 | Home | PART | greeting renders → totals, links | P1 | M2 |
| M-06 | Tab navigation | UI | `tabs-render` (render only) | P1 | M2 |
| M-07 | Add personal expense, keypad, category, date | UI | `expense-create`, `category-picker`, `date-picker` | P0 | M3 |
| M-08 | Draft restore, lost save response | UI | `draft-recovery`, `lost-save-response` | P0 | — |
| M-09 | Expense list, search, filters, detail, **edit, delete** | LOWER | utility Jest only | **P0** | M4 |
| M-10 | Move to group | NONE | | P0 | M4 |
| M-11 | Merchant and Item detail | NONE | | P1 | M8 |
| M-12 | Receipt scan from photo library | PART | iOS parses with mock backend; Android only proves OCR ran | P0 | R3 |
| M-13 | Receipt camera capture, item split | LOWER | `ItemSplitBoard.test`; camera needs a device | P0 | R3 |
| M-14 | Equal group expense from Add sheet | UI | `group-expense` | P0 | M5 |
| M-15 | Other splits and multiple payers | LOWER | `PayerPicker.test`, API split maths | P0 | M5 |
| M-16 | Groups list, create group, add member, People tab | PART | tab renders → all actions | P0 | M5 |
| M-17 | Group detail: edit/delete expense, balances, activity | LOWER | groups Jest | **P0** | M6 |
| M-18 | Settle up and payment-app links | LOWER | `paymentDeepLinks.test` | **P0** | M6, R6 |
| M-19 | Group settings, export, archive, leave, delete | LOWER | export Jest | P0 | M6 |
| M-20 | Invite link, signed in / signed out | PART | `deep-link-join`, `deep-link-signed-out`. Known gap F-014: signed-out invite is dropped | P1 | R2 |
| M-21 | Insights overview and scope | PART | `insights-scope-select` → totals | P0 | M7 |
| M-22 | Budgets (inside Insights) | NONE | | P1 | M8 |
| M-23 | Cards | LOWER | backend only | P2 | M8 |
| M-24 | Categories & tags | NONE | | P1 | M8 |
| M-25 | Recurring screen and due prompt | LOWER | `RecurringPrompt.test` | **P0** | M8 |
| M-26 | Ask | LOWER | consent and history Jest | P0 | R4 |
| M-27 | Activity | LOWER | `activityFeed.test` | P2 | M9 |
| M-28 | Account: edit profile, export | LOWER | `ProfileScreen` tests | P1 | M9 |
| M-29 | Password & security | LOWER | `SecurityScreen.test` | P0 | M9 |
| M-30 | Delete account | NONE | no mobile screen test found (backend deletion is tested) | **P0** | R8 |
| M-31 | Analytics/crash consent and Privacy (hidden in E2E builds) | LOWER | consent and analytics Jest; UAT-ANA-001..007 Not Run | P0 | M1, R9 |
| M-32 | Feedback, About | NONE | | P2 | M9 |
| M-33 | Push permission and notification tap | LOWER | notification Jest; needs a device | P1 | R6 |
| M-34 | Dark mode, small screen, keyboard, Android Back, VoiceOver/TalkBack | PART | sheet accessibility flows → the rest | P1 | M10, R7 |
| M-35 | Install over the previous release (stored session and draft) | NONE | needs a device or retained build | P0 | R10 |

Google sign-in and connected-assistant management are web only.

## Cross-cutting automation gaps

1. **Release does not require any of this.** `release_tools.py` has no check that reads `docs/qa`.
2. **CI runs with several features off or faked:** AI, MCP, real OCR, entity resolution, mail and push.
3. **Browser coverage is narrower than the suite size suggests:** many specs skip on the phone project (desktop-only), and Maestro is not in CI.
4. **No upgrade test** from the previous release's data through the UI (`migrations.yml` covers schema only, when migration paths change).
5. **No drift check:** a new route or screen can ship without a row here (planned next).

## Automation backlog (proposed order; not yet approved for implementation)

| Order | Work | Rows |
|---|---|---|
| A1 | **Done 2026-11-26 (TS-QA-105)**, except the itemized receipt split inside a group (W-17): web group money journeys through the UI | W-14, 21, 25..27, 29 |
| A2 | Mobile: expense edit/delete, settle up, group expense edit, other splits, recurring | M-09, 10, 15, 17, 18, 25 |
| A3 | Account safety on both: password reset completion, delete account, security, sign out all, consent | W-06, 43, 48; M-03, 29..31 |
| A4 | Web group settings and invite resume; mobile group management | W-30..32; M-16, 19, 20 |
| A5 | Remaining P1/P2 screens | the rest |

Every new money test must check the stored result through the API, not only the screen.

## Keeping this current

A change that adds or removes a route, screen, dialog or user flow updates its row here, the UAT case in `04` and, when a person must check it, `11`.
