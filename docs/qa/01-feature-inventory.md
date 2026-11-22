# 01 — Feature, Page and Component Inventory

Audit date: 2026-11-22 · Scope: web app (primary), mobile app (secondary, static review only) · Status of this document: **discovery output, living**.

## How to read evidence

| Tag | Meaning |
|---|---|
| **R** | Runtime-observed on an isolated local stack during this audit (scratch Postgres `trackspense_audit`, backend `:8090`, web `:3001`, synthetic users `audit.primary@…`/`audit.secondary@…`; `AI_ENABLED=false`, `OCR_ENGINE=mock`, mail disabled). Production and the developer's own `:8080` stack were not used. |
| **C** | Code-derived: the control/route exists in source (file named) but its behaviour was not exercised. |
| **U** | Unverified: inferred from names, docs or API modules; treat as a hypothesis. |

Routes come from `varavu_selavu_ui/src/App.tsx`; endpoints from `varavu_selavu_app/varavu_selavu_service/**` router decorators (131 route handlers found).

## 1. Web routes and pages

Auth key: **Guest** = only reachable logged-out (`RequireGuest` redirects signed-in users), **Auth** = `RequireAuth` (redirects to `/login`), **Open** = both.

| Page ID | Page | Route | Major interactive components | Purpose | Entry points | Exit points | Auth | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| PG-01 | Home / landing | `/` (`Root`) | Marketing tour (light/dark screenshots), FAQ accordions, Login / Create-account CTAs | Explains product; redirects signed-in users | Direct, header logo | Login, Register | Open (redirects to Dashboard when signed in) | Implemented | `pages/HomePage.tsx` C; redirect R |
| PG-02 | Login | `/login`, `/ai/reauth` | Email, Password (+show/hide), Login, "Continue with Google", Create account, Forgot password, Terms/Privacy links | Sign in (password or Google) | Guards redirect here; header Login | Dashboard (or stored return path), Register, Forgot | Guest | Implemented | `pages/LoginPage.tsx` R |
| PG-03 | Register | `/register` | Name*, Email*, Phone, Password*, Create Account, "Sign up with Google" | Create account | Login page | Dashboard / verify prompt | Guest | Implemented | `pages/RegisterPage.tsx` R |
| PG-04 | Forgot password | `/forgot-password` | Email, Send reset link, Back to Login | Request reset email | Login | Login | Open | Implemented | R |
| PG-05 | Reset password | `/reset-password?token=` | New / Confirm password, submit; "missing token" state | Complete reset | Emailed link | Login | Open | Implemented | R (missing-token state) |
| PG-06 | Verify email | `/verify-email?token=` | Verifying / success / "Link invalid or expired" states, Go to login/dashboard | Confirm email address | Emailed link | Login/Dashboard | Open | Implemented | R (invalid state) |
| PG-07 | Contact / Help | `/contact` | Name, Email, Subject, Message, Send Message | Public support form (`POST /email/send`) | Footer "Help", user menu | — | Open | Implemented | R |
| PG-08 | Join group (invite) | `/groups/join/:token` | "Log in to accept" / Accept / "Couldn't join group" states | Accept emailed group invite | Invite link | Groups, Login | Open | Implemented | R (guest + invalid-token states) |
| PG-09 | Dashboard | `/dashboard` | Scope toggle (My expenses / I paid), True Total hero, Net-with-people link, Insight card, Getting-started checklist, Budgets card, Card Coach card, "Where it went" spectrum, My groups strip, Recent list, "See all" | Single reconciled number + summaries | Post-login, nav | Expenses, Groups, Analysis, Quick Capture | Auth | Implemented | `pages/DashboardPage.tsx` R |
| PG-10 | Expenses — Transactions | `/expenses` (tab=transactions) | Scope tabs (Personal / Groups / Personal + my shares), Search, Month filter, Tag filter, Select mode, Export CSV, day-grouped feed, row edit/delete | Browse, find, edit, delete, bulk-tag, export | Nav, Dashboard "See all" | Detail sheet, Quick Capture | Auth | Implemented | `pages/ExpensesPage.tsx` R |
| PG-11 | Expenses — Recurring | `/expenses?tab=recurring` (`/recurring` redirects here) | Add recurring expense, template cards (options menu), form (Description, Merchant, Day of month, Monthly amount, Start date, Category), delete confirm | Manage recurring templates | Expenses toggle | Expenses | Auth | Implemented | `components/expenses/RecurringTab.tsx` R (empty state) / C |
| PG-12 | Groups (list + detail) | `/groups`, `/groups/:id` | Groups/People tabs, Active/Archived, Create group, group rail, detail: Expenses/Activity tabs, Add Expense, Add Member, Group settings, Settle up, balances | Shared expenses, splits, settlement | Nav, Dashboard strip, invite links | Group settings, Settle up, expense detail | Auth, flag `GROUPS_ENABLED` | Implemented (flag-gated) | `pages/GroupsPage.tsx` R |
| PG-13 | Analysis — Overview | `/analysis` | Month/Year toggle + month grid, "Choose month or year", scope select ("My spending"), "Include group shares", tag filter, category rows → drawer, "See the money flow" (Sankey), "Ask about it →" | Spend analysis for a period | Nav | Category drawer, Ask sheet | Auth | Implemented | `pages/ExpenseAnalysisPage.tsx`, `OverviewTab.tsx` R |
| PG-14 | Analysis — Items | `/analysis?tab=items` | Month/Custom/Year range, item list → item detail (Back, Avg/Lowest/Highest/Total, price history, "Ask AI" chip) | Item price history | Tab | Expenses | Auth | Implemented | `ItemsTab.tsx` R (list) / C (detail) |
| PG-15 | Analysis — Merchants | `/analysis?tab=merchants` | Same pattern: merchant list → detail (Lifetime Spent, Visits, Avg/visit) | Merchant insights | Tab | Expenses | Auth | Implemented | `MerchantsTab.tsx` R (list) / C |
| PG-16 | Analysis — Budgets | `/analysis?tab=budgets` | New Budget, budget cards (options menu, "Ask why"), form (Monthly limit, alert thresholds, rollover) | Budgets and pace | Tab, Dashboard checklist | — | Auth, flag `BUDGETS_ENABLED` | Implemented (flag-gated) | `BudgetsTab.tsx` R / C |
| PG-17 | Analysis — Cards (Card Coach) | `/analysis?tab=cards` | Add a card (catalog picker), custom card form, set default, remove, rewards table, "report" dialog | Which card to use | Tab | — | Auth, flag `CARD_COACH_ENABLED` | Implemented (flag-gated) | `CardsTab.tsx`, `CustomCardForm.tsx` R (empty) / C |
| PG-18 | Ask | `/ask` (`/ai-analyst` redirects with `?q=`) | Suggested-question chips, question box, Send, Stop, usage note ("N of 10 questions left") | AI Q&A on own spending | Nav icon, header | Chat overlay | Auth, `AI_ENABLED` | Implemented; **runtime-unverified** (AI off locally) | `AskPage.tsx`, `AIAnalystChat.tsx` R (idle UI) |
| PG-19 | Account | `/account` (`/profile` redirects) | Profile form (Name, Phone, Venmo, PayPal.me, UPI; Email read-only), Tags management, Change password, Sessions (Sign out / all devices), Export CSV/JSON, Help & legal, Log out, Delete Account, "Connected assistants" | Profile, security, data rights | User menu | Assistants, Delete dialog | Auth | Implemented | `pages/AccountPage.tsx`, `ProfilePage.tsx` R |
| PG-20 | Connected assistants | `/account/assistants` | Connection list, Disconnect, Reload, activity | Manage MCP assistant grants | Account | Account | Auth; MCP "default-off" | Implemented behind config | `pages/AssistantAccessPage.tsx` R (empty/idle) |
| PG-21 | Connect an assistant | `/ai/connect/:id` | Scope list, Connect / Decline | First-party OAuth consent | OAuth redirect | Assistants | Auth | Implemented | R (invalid id renders shell) |
| PG-22 | Approve expense | `/ai/approve/:id` | Review preview, "I reviewed warnings…" checkbox, Approve expense / Reject / Cancel approval | Human approval of assistant-prepared expense | MCP flow | Assistants | Auth | Implemented | R (invalid id → "Not Found") |
| PG-23 | Not found | `*` | "404", Back to dashboard | Unknown routes | — | Dashboard | Open | Implemented | R |
| — | Redirect shims | `/recurring`, `/ai-analyst`, `/item-insights`, `/merchant-insights`, `/profile` | none | Old bookmarks | — | — | — | Implemented | `App.tsx` C |

Document titles are set per route by `components/common/RouteA11y.tsx`; focus moves to the page `<h1>` on route change (R).

## 2. Global / shared UI (present on most pages)

| ID | Component | Where | Behaviour | Evidence |
|---|---|---|---|---|
| GL-01 | Header bar | `App.tsx` | Logo (→ `/`), type-to-log textbox (desktop), **New expense** (desktop), **Ask AI**, theme toggle, account menu | R |
| GL-02 | Side nav (desktop ≥ `md`) / Bottom nav + FAB "Add Expense" (below `md`) | `layout/SideNav.tsx`, `BottomNav.tsx`, `MainLayout.tsx` | Dashboard, Expenses, Analysis, Groups | R |
| GL-03 | Account menu | `layout/UserMenu.tsx` | Profile, Send feedback, Help & support, Privacy policy, Terms of service, Log out | R |
| GL-04 | Skip link + route titles | `App.tsx`, `RouteA11y.tsx` | "Skip to main content"; per-route `document.title` | R |
| GL-05 | Cookie consent banner | `common/ConsentBanner.tsx` | Accept / Decline analytics; fixed bottom | R — **see finding F-01** |
| GL-06 | AI consent dialog | `common/AiConsentHost.tsx` | Allow / Not now before any AI provider call | C |
| GL-07 | Email-verification banner/prompt | `EmailVerificationBanner.tsx`, `VerifyEmailPrompt.tsx` | Resend link, "I've verified", dismiss | C |
| GL-08 | Recurring-due sheet | `expenses/RecurringPrompt.tsx` | After login if templates are due: per-row Confirm, Confirm all, Dismiss | C (needs due templates) |
| GL-09 | Feedback dialog | `layout/FeedbackDialog.tsx` | Send feedback from menu | C |
| GL-10 | Error boundary | `common/ErrorBoundary.tsx` | "Reload" fallback | C |
| GL-11 | Footer | `layout/Footer.tsx` | Privacy, Terms (API-hosted pages), Help | R |

## 3. Overlays / dialogs

| ID | Overlay | Component | Opened from | Notes |
|---|---|---|---|---|
| OV-01 | Quick Capture "New expense" (dialog ≥ `md`, bottom sheet below) | `expenses/QuickCaptureSheet.tsx` | Header button, FAB, Dashboard checklist | Amount, Description, Date, More options, "Who was this with?", Save, Scan receipt, Discard draft; phone keypad. R |
| OV-02 | Expense details | `expenses/ExpenseDetailSheet.tsx` | Row click | Edit fields, tags, Move to group, Delete (confirm). R |
| OV-03 | Group expense details | `groups/ExpenseDetailDialog.tsx` | Group row click | Edit mode, comments, history, settle share, delete. C |
| OV-04 | Settle up | `groups/SettleUpDialog.tsx` | Group "Settle up", People list | Pick suggested transfer or custom (From, To, Amount, Method Cash/Venmo/UPI/Other, Notes). C |
| OV-05 | Group settings | `groups/GroupSettingsDialog.tsx` | "Group settings" | Members, invites, roles, simplify debts, mute, export CSV, leave/archive/delete (confirms). C |
| OV-06 | Ask panel (right drawer / bottom sheet) | `ask/AskOverlay.tsx` | Header Ask AI | Same chat as `/ask`; named dialog. R |
| OV-07 | Delete account | `profile/DeleteAccountDialog.tsx` | Account → Delete Account | Password (or type-email for Google accounts); Delete disabled until ready. R |
| OV-08 | Bulk tag / bulk-apply | `tags/BulkTagDialog.tsx`, `TagBulkApplyDialog.tsx` | Expenses select mode; Account "Tag a trip…" | C |
| OV-09 | Move to group | `expenses/MoveToGroupDialog.tsx` | Detail sheet | C |
| OV-10 | Category details drawer | `common/CategoryDetailsDrawer.tsx` | Analysis category rows | C |
| OV-11 | Confirm dialogs | `common/ConfirmDialog.tsx` + local confirms | Delete expense/budget/recurring/tag/group | R (delete expense) |
| OV-12 | Card detail / report | `analysis/CardDetailDialog.tsx` | Cards tab | C |

## 4. Feature inventory

| Feature ID | Feature | Pages / overlays | Status | Flag / condition |
|---|---|---|---|---|
| FEAT-AUTH | Email+password and Google sign-in, register, logout, reset, verify, sessions, sign-out-all | PG-02..06, PG-19 | Implemented | Google button requires client id |
| FEAT-DASH | Reconciled dashboard | PG-09 | Implemented | — |
| FEAT-EXP | Personal expense CRUD, search, filters, export, bulk tag | PG-10, OV-01/02/08/09 | Implemented | — |
| FEAT-QC | Quick Capture incl. draft recovery and unknown-outcome guard | OV-01, GL-01 | Implemented | — |
| FEAT-RCPT | Receipt scan → itemised expense (web: file/camera picker; mobile: on-device OCR) | OV-01 Scan, `ScannedItemsCard.tsx`, `useReceiptScan` | Implemented; **runtime-unverified** | `OCR_ENGINE`; AI consent |
| FEAT-REC | Recurring templates, due prompt, confirm | PG-11, GL-08 | Implemented | — |
| FEAT-GRP | Groups, members/invites, splits (equal/exact/%/shares/adjustment, itemised), balances, settlements, comments, activity, export | PG-12, OV-03/04/05 | Implemented | `GROUPS_ENABLED` |
| FEAT-ANL | Analysis: overview, items, merchants, money-flow, "what changed" | PG-13..15 | Implemented | — |
| FEAT-BUD | Budgets with thresholds, pace, rollover, "Ask why" | PG-16 | Implemented | `BUDGETS_ENABLED` |
| FEAT-CARD | Card Coach: catalog, custom cards, default, rewards, per-expense card | PG-17, OV-01 More options | Implemented | `CARD_COACH_ENABLED` |
| FEAT-TAG | Tags: create/rename/archive/delete, tag expenses, bulk apply, filters | PG-19, PG-10, OV-02/08 | Implemented | `TAGS_ENABLED` |
| FEAT-ASK | AI analyst chat; header type-to-log also routes questions | PG-18, OV-06 | Implemented | `AI_ENABLED`, per-user quota, AI consent |
| FEAT-SEC | Change password, session list/revoke, delete account, export data | PG-19, OV-07 | Implemented | — |
| FEAT-MCP | Connect external assistants via OAuth; approve each assistant-prepared expense | PG-20..22 | Implemented; "default-off" per `AGENTS.md` | `docs/mcp-local-implementation.md` |
| FEAT-SUP | Contact form, feedback, legal pages | PG-07, GL-09/11 | Implemented | — |
| FEAT-NOTIF | Push registration (`/devices/register`) and group fan-out | Mobile | Implemented (mobile) | `TRACKSPENSE_ENABLE_PUSH` |
| FEAT-ER | Entity resolution suggestions (merchant/item canonicalisation) | AddExpenseForm, QuickCapture | Implemented, off in audit env | `ENTITY_RESOLUTION_ENABLED` |

**Not found / not implemented (confirmed absent in routes):** user roles beyond group admin/member; admin UI (quota admin is CLI-only by design); multi-currency UI beyond group `currency`; budget/analysis export; offline mode.

## 5. Backend surface (what the UI can reach)

131 handlers: auth (17), expenses/analysis/analytics/ingest/recurring/budgets/cards/tags/email/config (55 in `api/routes.py`), groups (36), entity-resolution (6), devices (2), OAuth/MCP (12), health & static pages (6). Full mapping of UI → endpoint is in `02-interaction-inventory.md`.

## 6. Mobile (separate inventory — static review only)

Mobile was **not run** (no simulator/Expo session was started in this audit). Structure from `varavu_selavu_mobile/src`:

| Area | Screens / modules | Notes |
|---|---|---|
| Tabs (`app/tabs.tsx`) | Home (Dashboard), Expenses, Groups, Insights (Analysis), Ask (AI Analyst) | Shared with web journeys |
| Stack (`app/routes.ts`) | Activity, Profile, Recurring, ItemDetail, MerchantDetail, Cards, Tags, About, Feedback, Groups, GroupDetail, JoinGroup | |
| Core-registered | Auth (login/register), Security, DeleteAccount | `src/core` |
| Features | account, activity, ask, budgets, cards, expenses, groups, home, insights, receipts, recurring, tags | `budgets` has no screen folder (embedded in other screens) |
| Mobile-only | On-device receipt OCR (`modules/receipt-ocr`), push notifications, deep links (`linking.ts`), SecureStore drafts | |
| Web-only | Connected assistants / MCP pages, Contact page, CSV/JSON export buttons, header type-to-log bar | No equivalent route found on mobile (U) |
