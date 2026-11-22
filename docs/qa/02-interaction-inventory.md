# 02 — Interaction Inventory (web)

Evidence tags: **R** runtime-observed (audit stack, 2026-11-22), **C** code-derived (control exists; behaviour not exercised), **U** unverified/inferred. API paths are relative to `/api/v1`. "Data" = persistent change. Priorities: P0 release-blocking, P1 important, P2 lower risk (see `09-audit-summary.md` §Risk).

Global conventions observed (apply to every row unless noted): all state-changing requests send the CSRF header (`vs_csrf` double-submit); a 401 anywhere triggers `forceLogout` → `/login`; viewports are desktop ≥ MUI `md` (900px) shell vs phone shell (<900) with bottom nav + FAB; sheets are dialogs on desktop and bottom sheets on phones; every dialog/sheet is `role=dialog` with a name and closes on Escape (R).

Mobile-width behaviour was observed at 390px for navigation, Quick Capture sheet and the failure path only; other rows are desktop observations or code.

## A. Authentication & session (PG-02..06, GL-03)

Preconditions: logged out unless noted.

| ID | Feature | Page | Element (type) | Trigger → expected result | API / handler | Data | Failure / cancel / repeat | Pri | Ver |
|---|---|---|---|---|---|---|---|---|---|
| INT-001 | AUTH | Login | Email, Password (inputs, `autocomplete` username/current-password) | Type → value held; fields flag `aria-invalid` on error | `LoginPage.tsx` state | — | — | P0 | R |
| INT-002 | AUTH | Login | Show/Hide password (icon button, `aria-pressed`) | Click → toggles masking | `PasswordField.tsx` | — | Mousedown does not blur field | P2 | R |
| INT-003 | AUTH | Login | Login (submit) | Submit valid creds → cookies set, `localStorage.vs_user`, navigate to dashboard / stored return path | `POST /auth/login` (form: username,password) | Session cookies | Wrong creds → "Incorrect email or password." as `role=alert`, focus to password; 429 → "Too many attempts…"; network fail → "Can't reach the server…"; empty → "Enter your email and password." with no request | P0 | R |
| INT-004 | AUTH | Login | Continue with Google (button, loads GIS on click) | Click → Google popup → ID token | `POST /auth/google` | Session | Popup closed → remains; GIS load failure hides button | P1 | R (button) / C |
| INT-005 | AUTH | Login | Create account / Forgot password / Terms / Privacy (links) | Click → `/register`, `/forgot-password`, API-hosted legal pages (new tab) | router / `${API}/terms-of-service` | — | — | P2 | R |
| INT-006 | AUTH | Register | Name*, Email*, Phone, Password* (inputs) | Per-field validation, no request until valid | `RegisterPage.tsx` | — | Server field errors mapped to fields | P0 | R |
| INT-007 | AUTH | Register | Create Account (submit) | Valid → account created, signed in, verification prompt | `POST /auth/register` then login | User row | Duplicate email → generic error (no enumeration); weak password blocked (<8, common) | P0 | C |
| INT-008 | AUTH | Register | Sign up with Google | As INT-004 | `POST /auth/google` | User row | — | P1 | R (button) |
| INT-009 | AUTH | Forgot | Email + Send reset link | Submit → success text regardless of account existence | `POST /auth/forgot-password` | Reset token emailed | Empty/invalid email blocked | P1 | R (form) / C |
| INT-010 | AUTH | Reset | New / Confirm password + submit | Valid token → password changed → login | `POST /auth/reset-password` | Password hash; sessions ended | Missing token state R: "This link is missing its reset token."; expired token → error | P1 | R (missing) / C |
| INT-011 | AUTH | Verify email | Auto-verify on load | Valid token → "Email verified"; invalid → "Link invalid or expired" + Go to login | `POST /auth/verify-email` | `email_verified=true` | Reload with used token → invalid | P1 | R (invalid) / C |
| INT-012 | AUTH | any guarded route | Route guard | Logged-out visit to `/dashboard` etc. → `/login` | `RequireAuth` | — | After login returns to stored destination (`postLoginDestination`) | P0 | R |
| INT-013 | AUTH | Login/Register | Guest guard | Logged-in visit → dashboard | `RequireGuest` | — | — | P2 | R |
| INT-014 | AUTH | Header | Account menu (icon button → menu) | Click → Profile, Send feedback, Help & support, Privacy policy, Terms of service, Log out; Escape closes, focus returns | `UserMenu.tsx` | — | — | P1 | R |
| INT-015 | AUTH | Header | Log out (menu item) / Account page "Log out" | Click → cookies cleared, `vs_user` removed → `/login` | `POST /auth/logout` | Refresh token revoked | Already-expired session still lands on login | P0 | C |
| INT-016 | AUTH | Account | Sign out of all devices | Click → all sessions + MCP grants revoked | `POST /auth/logout-all` | Tokens invalid (`token_valid_after`) | Cancel/confirm UX not verified (U) | P1 | C |
| INT-017 | AUTH | Account | Sessions list → Sign out (per session) | Click → that device ends | `GET /auth/sessions`, `DELETE /auth/sessions/{family_id}` | Refresh family revoked | Current device shown as "This device" | P1 | R (list) / C |

## B. Navigation & shell (GL-01..05, GL-11)

| ID | Feature | Page | Element | Trigger → expected | API / handler | Data | Failure / edge | Pri | Ver |
|---|---|---|---|---|---|---|---|---|---|
| INT-020 | NAV | Shell | Side nav links (Dashboard, Expenses, Analysis, Groups) | Click → client route, `aria-current=page`, ctrl/cmd-click opens new tab | `SideNav.tsx` | — | Groups link hidden when flag off (C) | P0 | R |
| INT-021 | NAV | Shell (<900px) | Bottom nav + FAB "Add Expense" | Tap → route / opens Quick Capture | `BottomNav.tsx`, `MainLayout.tsx` | — | FAB hides on scroll-down; **covered by cookie banner until consent answered (F-01)** | P0 | R |
| INT-022 | NAV | Header | Logo | Click → `/` (→ dashboard when signed in) | `App.tsx` | — | — | P2 | R |
| INT-023 | NAV | Header | Theme toggle | Click → light/dark persisted | `ThemeModeContext` | `localStorage` | System preference respected on first load (C) | P2 | R |
| INT-024 | NAV | Header | Ask AI (icon button) | Click → Ask panel opens (dialog "Ask"), Escape closes | `AskContext`, `AskOverlay.tsx` | — | — | P1 | R |
| INT-025 | NAV | Header (desktop) | Type-to-log textbox | Type "dinner 84.20 at Nopa split with <group>" → parsed preview strip; Enter logs expense; a question mark opens Ask | `useQuickLogBar`, `quickLogParse.ts`, `POST /expenses` | Expense | Parse failure → inline `role=alert`; success → `role=status` | P0 | C (preview not exercised) |
| INT-026 | NAV | Shell | Skip link | Tab first → "Skip to main content" focuses `#main-content` | `App.tsx` | — | — | P1 | R |
| INT-027 | NAV | Shell | Browser back/forward | History navigation works across tabs (`?tab=`), no duplicate writes | react-router | — | Dirty Quick Capture draft shows browser "Leave site?" prompt on full navigation (R) and restores on return | P1 | R |
| INT-028 | NAV | any | Route change | Title set, focus to `<h1>` | `RouteA11y.tsx` | — | Query-only changes do not steal focus | P1 | R |
| INT-029 | NAV | any | Cookie consent Accept / Decline | Click → banner removed; analytics only after Accept | `analyticsConsent.ts` (localStorage) | Consent flag | Banner reappears if storage cleared | P1 | R |
| INT-030 | NAV | Footer | Privacy / Terms / Help | Navigate (legal pages hosted by API) | links | — | — | P2 | R |

## C. Dashboard (PG-09)

Preconditions: signed in; data-dependent cards appear only when data exists.

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / edge | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-040 | DASH | Scope toggle (My expenses / I paid) | Click → hero total re-scopes (one number, two lenses) | `GET /analysis`, `TrueTotalHero.tsx` | — | Pressed state exposed (`aria-pressed`) | P1 | R |
| INT-041 | DASH | True Total hero | Render → month total; "RECONCILED" when group nets are zero | `GET /analysis` | — | Total must equal sum of month rows (`DASH-002/003` in qa) | P0 | R |
| INT-042 | DASH | "Net with people" (link) | Click → Groups/People | router | — | "all settled up →" when zero | P1 | R |
| INT-043 | DASH | Insight card ("New: Nopa, $84.20", expandable) | Click → expands "what changed"; chip → Analysis | `GET /analytics/changes` | — | No insights → hidden | P2 | R |
| INT-044 | DASH | Getting-started checklist (4 items; each a button) | Click item → Quick Capture / Groups / Budgets / Cards tab; Dismiss (X) hides | `GettingStartedChecklist.tsx` | `localStorage` dismissal | Completed items disabled | P2 | R |
| INT-045 | DASH | Budgets summary card | Click → Analysis Budgets tab; Dismiss | `GET /budgets` | — | Flag off → hidden | P2 | R |
| INT-046 | DASH | Card Coach summary card | Click → Cards tab | `GET /cards/coach`, `/cards/mine` | — | Flag off / no cards → hidden | P2 | C |
| INT-047 | DASH | "Where it went" spectrum rows | Render → categories with % ; click opens category drawer (C) | `GET /analysis` | — | Empty → empty state | P1 | R |
| INT-048 | DASH | My groups strip (cards) | Click → `/groups/:id` | `GET /groups`, group expenses | — | "Settled" state shown | P2 | R |
| INT-049 | DASH | Recent list + "See all ›" | Click row → detail; See all → `/expenses` | `GET /expenses` | — | — | P1 | R |

## D. Quick Capture / New expense (OV-01) — the core write path

Preconditions: signed in. Opens from header **New expense**, FAB, checklist, `/groups` "Add Expense". Desktop = dialog, phone = bottom sheet with on-screen keypad (R).

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / cancel / repeat | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-050 | QC | Amount (input; keypad keys on phone) | Type → 2-decimal max, ceiling enforced client-side; label "Amount" | `utils/amount.ts` | — | 3rd decimal / > ceiling cannot be composed (qa EXP-006/007); negative rejected | P0 | R |
| INT-051 | QC | Description (input) | Type → debounced category suggestion | `POST /expenses/categorize` (observed after typing) | — | AI off → deterministic tiers only; failure silent (user can pick) | P0 | R |
| INT-052 | QC | Category suggestion/picker (appears after description) | Select → category set | `CategoryPickerField.tsx` | — | — | P0 | C |
| INT-053 | QC | Date (date input; default today) | Change → date used | native date | — | Invalid/future handling not verified (U) | P1 | R |
| INT-054 | QC | More options (expander): Merchant, Tags, Card | Expand → extra fields | `EntityAutocomplete`, `TagInput`, `CardPickerField` | — | Card picker only if Card Coach on | P2 | R (collapsed) / C |
| INT-055 | QC | "Who was this with?" chips: Just me / <group> | Select group → split + payer pickers appear | `GET /groups` | — | Flag off → chips hidden | P0 | R |
| INT-056 | QC | Save expense (button) | Enabled only with amount **and** description → one POST; success state "Logged to your personal ledger." with Log another / Done | `POST /expenses` (personal), `POST /groups/{id}/expenses` (group), `POST /expenses/with_items` (itemised) | Expense row(s) | **Double-click sent exactly one POST (R)**; network failure → "The save outcome is unknown. Check Expenses before saving again…" + "I checked Expenses — allow another save" (R) | P0 | R |
| INT-057 | QC | Log another / Done | Click → reset form / close | state | clears draft | — | P1 | R |
| INT-058 | QC | Close (X) / Escape with dirty form | Closes **without** confirm; draft kept; reopening shows restored values; navigation prompts browser "Leave site?" | `expenseDraft` (sessionStorage, account-scoped, 1 h TTL) | Draft only | Auth expiry preserves draft; logout clears | P0 | R |
| INT-059 | QC | Discard draft (button) → confirm "Discard this expense? Cancel/Discard" | Discard → draft deleted | state | Draft removed | Cancel keeps | P1 | R |
| INT-060 | QC / RCPT | Scan receipt (button + hidden file/camera inputs) | Pick image → parse → items card | `POST /ingest/receipt/parse` (cloud) | Draft with items | Unsupported type 415, >12 MB 413 (API qa NEG-005..007); low-confidence → AI fallback (needs consent) | P0 | C |
| INT-061 | RCPT | Scanned items card: edit item name/amount, remove item, add item | Edit → total recomputed; Save persists items | `ScannedItemsCard.tsx`, `POST /expenses/with_items` | Expense + items | Item sum ≠ total handling **unverified (U)** | P0 | C |
| INT-062 | QC | Pending-outcome guard after reload | Reopen sheet → "Your unsaved expense was restored" + unknown-outcome notice | `useQuickCapture`/draft | — | Must not auto-replay write | P0 | R |

## E. Expenses page (PG-10, PG-11, OV-02, OV-08, OV-09)

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / cancel / repeat | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-070 | EXP | Scope tabs: Personal / Groups / Personal + my shares | Click → feed re-scoped | `GET /expenses`, `GET /groups/{id}/expenses` | — | Groups tab hidden when flag off | P1 | R |
| INT-071 | EXP | Search expenses (input) | Type → filtered (debounced); special chars safe; clear restores | `GET /expenses` (query) / client filter | — | No match → "No expenses match this view… Clear filters" (R) | P1 | R |
| INT-072 | EXP | Month filter (select/date) | Change → month scope | `GET /expenses` | — | — | P1 | R |
| INT-073 | EXP | Tag filter (autocomplete) | Pick tags → filtered | `GET /tags` | — | Flag off → hidden | P2 | R |
| INT-074 | EXP | Transactions / Recurring (toggle) | Click → `?tab=` swap | `SegmentedTabs` | — | — | P1 | R |
| INT-075 | EXP | Expense row (stretched button; label "<merchant>, <amount>") | Click/Enter/Space → detail sheet | `ExpenseFeed.tsx` | — | Hover/focus reveals edit/delete | P0 | R |
| INT-076 | EXP | Row **edit** (icon button) | Click → detail sheet in edit | `ExpenseFeed.tsx` | — | — | P1 | R |
| INT-077 | EXP | Row **delete** (icon button) → confirm "Delete expense? This action cannot be undone." | Delete → row removed, totals drop | `DELETE /expenses/{row_id}` | Row deleted | Cancel keeps row (qa EXP-002); other user's id → 404 (qa EXP-017) | P0 | R (dialog) / C |
| INT-078 | EXP | Detail sheet: Description, Merchant, + Add tag, Date, Amount, Notes | Edit → dirty | `ExpenseDetailSheet.tsx` | — | Escape closes (R) | P0 | R |
| INT-079 | EXP | Detail: Save changes | Click → PUT, sheet closes, views refresh | `PUT /expenses/{row_id}` | Row updated | Validation 422 shown inline; repeat click disabled while saving | P0 | C |
| INT-080 | EXP | Detail: Move to group… → dialog (Group select, Cancel, confirm) | Confirm → personal expense becomes group expense | `POST /groups/{expense_id}/move_to_group` | Row converted | Cancel safe | P1 | C |
| INT-081 | EXP | Detail: Delete expense (button) | As INT-077 | `DELETE /expenses/{row_id}` | Row deleted | — | P0 | R |
| INT-082 | EXP | Select (toggle) → select mode: checkboxes, Cancel, Tag, Untag, Clear, Export CSV | Select rows → bulk tag/untag | `POST /tags/bulk_apply`, `/tags/bulk_remove` | Tag links | Cancel exits; Clear empties selection | P2 | R (mode) / C |
| INT-083 | EXP | Export CSV (button) | Click → file download of the **current month filter** | `GET /expenses/export.csv` | — | CSV formula-injection guarded server-side (`csv_safety`) | P1 | R (button) / C |
| INT-084 | EXP | Infinite scroll sentinel | Scroll → next page | `GET /expenses?limit&offset` | — | `hasMore=false` stops | P1 | C |
| INT-085 | REC | Recurring tab: Add recurring expense / Add (buttons) → FormSheet | Fill Description, Merchant, Day of month, Monthly amount, Start date, Category → Save recurring expense | `POST /recurring/upsert` | Template | Required fields; cancel closes | P1 | R (empty) / C |
| INT-086 | REC | Template card options menu (Edit / Run now / Delete) | Choose → edit form / execute / delete confirm | `POST /recurring/execute_now`, `DELETE /recurring/templates/{id}` | Expense created / template removed | Run-now twice must not double-create (**U**) | P1 | C |
| INT-087 | REC | Due prompt (sheet) → Confirm (per row, editable amount), Confirm all selected, Dismiss | Confirm → expenses created, views refreshed | `GET /recurring/due`, `POST /recurring/confirm` | Expenses | Failure → "Failed to add one or more expenses…" alert | P0 | C |

## F. Groups (PG-12, OV-03/04/05)

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / cancel / repeat | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-100 | GRP | Groups / People tabs | Click → group rail vs per-person balances | `GET /groups`, `GET /groups/balances` | — | — | P1 | R |
| INT-101 | GRP | Create group (button/icon) → dialog (name, type, currency) → Create Group | Submit → group appears, selected | `POST /groups` | Group | Empty name blocked; cancel closes | P0 | R (empty state) / C |
| INT-102 | GRP | Active / Archived toggle | Click → list filter | client | — | — | P2 | R |
| INT-103 | GRP | Group rail item | Click → `/groups/:id` detail | `GET /groups/{id}` | — | Non-member → 404 "Group not found" by design | P0 | R |
| INT-104 | GRP | Add Member → dialog (by email or name-only) | Submit → member seated / invite | `POST /groups/{id}/members`, `/invites` | Member | Unregistered/unverified email → 400 "No registered user… add as placeholder" (R via API) | P0 | R (API) / C |
| INT-105 | GRP | Add Expense (group) → Quick Capture with group preselected | Save → group expense | `POST /groups/{id}/expenses` | Expense + splits | Payers ≠ total / exact split ≠ total → 4xx (qa GRP-006/007) | P0 | C |
| INT-106 | GRP | Group expense row → ExpenseDetailDialog (view/edit, comments, history, settle share) | Edit → PUT (omit payers+split keeps stored split) | `PUT /groups/{id}/expenses/{eid}`, `GET …/comments`, `POST …/comments` | Expense / comment | Delete comment confirm | P0 | C |
| INT-107 | GRP | Group expense row edit/delete icons | As INT-076/077 for group | `DELETE /groups/{id}/expenses/{eid}` | Row deleted; balances change | Archived group hides actions | P0 | R (controls) |
| INT-108 | GRP | Balances panel / BalanceList | Render → who owes whom; "Simplified" chip | `GET /groups/{id}/balances` | — | Nets sum to zero (qa CALC-006) | P0 | R |
| INT-109 | GRP | **Settle up** (button) → Settle dialog: pick suggested transfer or "Record a custom settlement" (From, To, Amount, Method, Notes) → Done | Confirm → settlement recorded | `POST /groups/{id}/settlements` | Settlement | Back (stage), Cancel; can't close mid-settling | P0 | C (opens; not exercised) |
| INT-110 | GRP | People list "Settle" per person | Click → Settle dialog prefilled | `PeopleList.tsx` | — | — | P1 | C |
| INT-111 | GRP | Activity tab | Render → feed | `GET /groups/{id}/activity` | — | — | P2 | R (tab present) |
| INT-112 | GRP | Group settings (dialog) | Members (invite sent/Name only chips), copy invite link, send invite email, role change, Enable Simplify Debts, Mute this group, Export CSV, Leave, Archive, Delete (each confirm) | `PUT /groups/{id}`, `/notification_preferences`, `/archive`, `DELETE /groups/{id}`, `/leave`, `GET /export.csv` | Group state | Last admin leaving / delete confirms (U) | P0 | C |
| INT-113 | GRP | Join via invite link | Logged-in → accept; logged-out → "Log in to accept this invite" then returns | `POST /groups/invites/accept` | Membership | Invalid token → "Couldn't join group" (R) | P1 | R |
| INT-114 | GRP | Item split board (itemised group expense) | Toggle members per item, suggested assignee chip | `ItemSplitBoard.tsx`, `GET …/items/suggest_assignment` | Item shares | — | P1 | C |

## G. Analysis (PG-13..17)

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / edge | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-120 | ANL | Tab toggle: Overview / Items / Merchants / Budgets / Cards | Click → `?tab=` | `SegmentedTabs` | — | Budgets/Cards hidden when flags off | P1 | R |
| INT-121 | ANL | Month / Year toggle + month grid (Jan–Dec) + "Choose month or year" | Select → period data | `GET /analysis` | — | Current period compares like-for-like | P1 | R |
| INT-122 | ANL | Scope select ("My spending" …) and "Include group shares" switch | Change → re-query | `GET /analysis` | — | — | P1 | R |
| INT-123 | ANL | Tag filter | Pick → filtered | `GET /tags` | — | — | P2 | R |
| INT-124 | ANL | Category row (button "<cat>$amount") → drawer | Click → category details drawer | `CategoryDetailsDrawer.tsx` | — | Escape closes | P1 | R (rows) / C |
| INT-125 | ANL | "See the money flow" | Toggle → Plotly Sankey (lazy) | `MoneyFlowSankey.tsx`, `LazyPlot` | — | Chart has no text alternative (see 07) | P2 | R (button) |
| INT-126 | ANL | "Ask about it →" / Ask AI chips | Click → Ask sheet with scoped question | `AskSheet.tsx`, `POST /analysis/chat` | AI quota | AI off/consent/quota states (U) | P1 | R (control) |
| INT-127 | ANL | Items: range toggle (Month/Custom/Year), item row → detail (Back, Avg/Lowest/Highest/Total, price history, store chips) | Click → detail; Back returns | `GET /analytics/items`, `/items/{name}` | — | No data → empty state | P1 | R (list) / C |
| INT-128 | ANL | Merchants: same pattern (Lifetime Spent, Visits, Avg/visit) | | `GET /analytics/merchants`, `/{name}` | — | | P1 | R (list) / C |
| INT-129 | ANL | "What changed" rail / change insights | Click "View details" → Items/Merchants detail | `GET /analytics/changes` | — | — | P2 | C |

## H. Budgets and Card Coach (PG-16, PG-17)

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / cancel | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-140 | BUD | New Budget → form: Monthly limit (+ suggestion chips), alert-threshold chips ("Alert at N%"), "Roll over unused amount", Save | Save → budget card | `POST /budgets`, `GET /budgets/suggestions` | Budget | Negative amount 422 (qa BUD-002); same scope+category edits in place (BUD-001) | P1 | R (button) / C |
| INT-141 | BUD | Budget card: pace bar, options menu (Edit / Mute / Delete), **Ask why** | Delete → confirm; Ask why → explanation | `PATCH/DELETE /budgets/{id}`, `POST /budgets/{id}/ask-why`, `GET …/breakdown` | Budget | Cancel safe; Ask why consumes AI quota | P1 | R (controls) / C |
| INT-142 | CARD | Add a card (button) → catalog picker → add | Pick → card in wallet | `GET /cards/catalog`, `POST /cards/mine` | User card | Duplicate add (U) | P1 | R (button) / C |
| INT-143 | CARD | Custom card form: Card name, Issuer, Annual fee, rate rows (+/remove), Save/Cancel | Save → custom card | `POST /cards/custom` | Custom card | Required name; cancel | P2 | C |
| INT-144 | CARD | Set default card / Remove card (icon buttons) | Click → default / removed | `POST /cards/mine/{id}/set_default`, `DELETE /cards/mine/{id}` | Wallet | Remove has no confirm? (U) | P1 | C |
| INT-145 | CARD | Card detail dialog → Report a problem (Cancel/Submit) | Submit → correction | `POST /cards/corrections` | Report | — | P2 | C |

## I. Ask / AI (PG-18, OV-06)

AI was **off** in the audit environment (`AI_ENABLED=false`); only idle UI was observed.

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / edge | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-160 | ASK | Suggested-question chips (4) | Click → sends | `AIAnalystChat.tsx` | AI usage | — | P1 | R (present) |
| INT-161 | ASK | Question box + Send message | Enter/Send → "Thinking…" status then answer in `role=log` | `POST /analysis/chat` | Quota decrement | Stop button aborts; error `role=alert`; off-topic refused without using quota; consent dialog first | P0 | U |
| INT-162 | ASK | Usage note ("N of 10 questions left today") | Render | `GET /ai/usage` | — | Exhausted → blocked state | P1 | R |
| INT-163 | ASK | Close (X) in panel / Escape | Closes; pending work retained above the drawer (`useChatConversation`) | context | — | Account change/logout clears | P1 | C |
| INT-164 | ASK | AI consent dialog (Allow / Not now) | Allow → calls permitted | `aiConsent.ts` | `localStorage` | Not now → AI features blocked | P0 | C |

## J. Account, security, data rights (PG-19, OV-07)

| ID | Feature | Element | Trigger → expected | API / handler | Data | Failure / cancel | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-180 | ACC | Profile form: Name, Phone, Venmo, PayPal.me, UPI (Email read-only) + Save changes | Save → profile persisted | `PUT /auth/profile` | User | Persists after reload (qa SET-001/002) | P1 | R (form) / C |
| INT-181 | SEC | Change password: Current, New, Confirm (+show/hide) + Change password | Mismatch → "Passwords don't match." and button stays disabled; valid → changed | `POST /auth/change-password` | Hash; other sessions ended | Helper "At least 8 characters. Avoid common passwords." | P0 | R (mismatch) / C |
| INT-182 | SEC | Email me a reset link | Click → email | `POST /auth/forgot-password` | Token | — | P2 | R (button) |
| INT-183 | TAG | Tag management: Tag a trip… (bulk-apply dialog), Show archived, rename / archive / delete icons | Rename inline; delete confirm | `POST/PUT/DELETE /tags…`, `POST /tags/bulk_apply` | Tags | Cancel safe | P2 | R (controls) / C |
| INT-184 | SEC | Export all expenses (CSV) / Download all my data (JSON) | Click → download | `GET /expenses/export.csv`, `GET /account/export` | — | Must include all user tables (privacy) | P1 | R (buttons) |
| INT-185 | SEC | **Delete Account** → dialog (type password, or email for Google accounts); Delete disabled until ready; Cancel | Confirm → account + personal data deleted, session ended | `DELETE /auth/profile` | Irreversible | Cancel safe (R); never run against shared data | P0 | R (dialog, cancel) / C |
| INT-186 | MCP | Connected assistants (button → page): Reload, Disconnect <client>, Sign in again | Disconnect → grant revoked | `GET/DELETE /mcp/connections`, `GET /mcp/activity` | Grant | Page renders with empty state (R) | P1 | R (idle) / C |
| INT-187 | MCP | Connect: scope list, Connect / Decline | Connect → code issued, redirect to client | `GET/POST /mcp/consent/{rid}` | Grant | Invalid id → shell only (R) | P1 | R (invalid) / C |
| INT-188 | MCP | Approve: warnings, "I reviewed the warnings and possible duplicates…" checkbox, Approve expense / Reject / Cancel approval | Approve → exactly one idempotent save | `GET/POST /mcp/approvals/{oid}` | Expense | Invalid id → "Not Found" (R); duplicate warnings must gate approval | P0 | C |

## K. Support & public (PG-07, GL-09)

| ID | Feature | Element | Trigger → expected | API | Data | Failure | Pri | Ver |
|---|---|---|---|---|---|---|---|---|
| INT-200 | SUP | Contact form (Name, Email, Subject, Message, Send Message) | Valid → success message | `POST /email/send` | Email sent (disabled locally) | Validation; mail failure message (U) | P2 | R (form) |
| INT-201 | SUP | Feedback dialog (menu → Send feedback; Cancel/Send) | Send → success | `POST /email/send` | Email | Cancel safe | P2 | C |
| INT-202 | NAV | 404 page "Back to dashboard" | Click → `/dashboard` | router | — | — | P2 | R |

## L. Keyboard & accessibility interactions (cross-cutting, observed unless noted)

| ID | Interaction | Expected | Ver |
|---|---|---|---|
| INT-220 | Tab order starts at skip link; consent banner is early in DOM | Logical; visible 2px focus ring | R |
| INT-221 | Escape closes every dialog/sheet/menu and returns focus to the trigger | Yes for New expense, detail, Ask, menu | R |
| INT-222 | Dialog focus trap | Focus cycles inside modal | R (New expense) |
| INT-223 | Enter submits login/register/forgot forms; Enter in type-to-log logs | Yes | R (login) / C |
| INT-224 | Errors announced: login/register/forgot (`role=alert`), chat (`role=log`/`status`/`alert`), Quick Capture failure | Yes | R |
| INT-225 | Disabled-with-reason: Save expense (needs amount + description), Change password (mismatch), Delete account (until proof) | Yes | R |
| INT-226 | Screen-reader semantics (names, one `<h1>`/page, route titles) and automated a11y | Axe scan on 2026-11-22 (`scripts/quality/axe-scan.mjs`, 5 public + 6 app routes, light + dark): **serious color-contrast on the header avatar** (`.MuiAvatar-root` initials, #fafafa on #bdbdbd = 1.79:1) on every app route; moderate heading-order on `/`, `/contact`, `/groups`, `/account`. No other violations. **No manual screen-reader pass was performed.** | R (automated only) |

## Counts (this document)

Rows: Auth 15, Shell 11, Dashboard 10, Quick Capture 13, Expenses/Recurring 18, Groups 15, Analysis 10, Budgets/Cards 6, Ask 5, Account/MCP 9, Support/404 3, Keyboard/A11y 7 → **124 meaningful interactions** (trivial controls such as individual month-grid buttons or Back chevrons are grouped, not itemised).
Verification split: 96 rows (77%) have at least the control observed at runtime (R — often existence and primary behaviour only, not every branch); 28 rows are code-derived or unverified (C/U) — see `07-qa-gap-analysis.md`.
