# AGENTS.md — Project Memory

## ⚠️ Maintenance Instruction (read first)
Before ending any session where you implemented, changed, or fixed something meaningful:
1. Add one line to CHANGELOG.md: date, what changed, which agent/tool did it.
2. If this introduces a new design decision, pattern, or constraint future sessions
   need to know, add it to this file's "Key Decisions" section.
3. If this affects planned work, update ROADMAP.md.
4. If schemas, endpoints, or architecture changed, update the product spec (below).
Do NOT log routine changes here — this file holds decisions and pointers, not a
feature log or reference docs. Keep it short; put detail in the files below.

## Where to look (pull on demand, don't preload)
- What the product is → `README.md` (overview); full product & technical spec — features, business rules, schemas, endpoints → `docs/TrackSpense_Complete_Product_Specification.md`
- Architecture, patterns, testing setup → `docs/ARCHITECTURE.md`
- Hosting, DNS, CI/CD, secrets → `docs/INFRASTRUCTURE.md`
- What's built vs. not → `docs/FEATURE_STATUS.md`; feature specs → `docs/features/`
- Per-component setup → `varavu_selavu_app/`, `varavu_selavu_ui/`, `varavu_selavu_mobile/`, `qa/` READMEs
- Past changes → `CHANGELOG.md`; planned work → `ROADMAP.md`
- Engineering standards, review workflows, checklists, severity model → `.ai-sdlc/` (read the one file you need, never the folder)

## Always
- Web ↔ mobile parity: a feature or fix in one client must be checked in the other.
- Git: leave changes uncommitted unless asked; one commit per logical item; never push without asking.
- CI: `qa.yml` runs the Playwright suites; `unit.yml` runs web lint/tsc/Jest, mobile tsc/Jest and backend pytest. Neither is in `release-check` — `make unit-check` runs the unit set locally.
- Git hooks (`make install-hooks`): commits to main run fast checks for the staged areas; pushes to main run `make release-check` (pytest + audits); pushing a `release-*` tag requires the GitHub Actions QA run to have passed on that commit. Don't bypass with `--no-verify` unless the user asks.

## Engineering workflow (AI SDLC)
Shared by Claude Code and Codex. Policy lives in `.ai-sdlc/`; skills in `.agents/skills/` (Claude sees them via `.claude/skills/` symlinks, and also has read-only subagents in `.claude/agents/`). Don't copy policy into tool-specific files.
- **Commands:** `make test-backend` · `make lint-web typecheck-web test-web` · `make typecheck-mobile test-mobile` · `make qa-smoke|qa-regression|qa-api` · `make audit-all` · `make unit-check` · `make release-check`. Area-aware wrapper: `scripts/quality/verify.sh [--full]`; also `accessibility.sh`, `security.sh`, `e2e.sh`.
- **Plan first** (and get a yes) when a change spans ≥3 files, touches an API/schema/contract, auth or permissions, money maths, a new screen, or both clients. Otherwise just implement.
- **Tests:** every change ships with tests (bug fix: failing-first; endpoint: success + validation + 401/403; UI: RTL by role/name). Run `scripts/quality/verify.sh` before asking for review. Never weaken a test to pass.
- **Done =** `.ai-sdlc/checklists/definition-of-done.md` (apply only the lines that fit — a typo needs none), plus the CHANGELOG line above.
- **Review only what the change warrants:** `scripts/quality/route-review.sh` prints the reviewers; typos/docs/copy get none, a style-only change gets none unless colour/focus/size changed. Deterministic checks run before any AI review.
- **Severity:** P0 blocker · P1 high · P2 medium · P3 low; findings are Confirmed / Suspected / Improvement (`.ai-sdlc/README.md`).

### Skill routing (natural language works; explicit names also work)
| User says / change is | Skill |
|---|---|
| implement, add, build, fix, change behaviour | `feature-development` |
| "review this PR/changes", "ready to merge?" | `pr-review` (routes to the rest) |
| "review the code", correctness, regressions, migrations | `implementation-review` |
| acceptance criteria, spec/business rules, new feature | `product-review` |
| "are the tests enough" | `test-review` |
| auth, endpoints, permissions, uploads, secrets, AI quota, user data, "is this safe" | `security-review` |
| UI change, "check accessibility/WCAG/keyboard" | `accessibility-review` |
| "review this page/flow for UX", responsive, dark mode, copy | `ux-review` |
| slow queries, scaling, charts, heavy screens | `performance-review` |
| "ready for production/release", tag | `release-readiness` |
In Claude Code, "use the security-reviewer" delegates to the matching subagent (`<role>-reviewer`, `release-reviewer` for release-readiness); in Codex, say "use the security-review skill" or just describe the task. Several reviewers may apply to one change (e.g. an auth endpoint: implementation + test + security) — run them in the order in `.ai-sdlc/workflows/code-review.md`.

## Key Decisions
- **Money is `Decimal`, never float** (`core/money.py`) — float totals produced rounding artifacts.
- **The user's identity is their email** (FK `users.email`), not `users.id`. This is legacy and pervasive, so don't "fix" it piecemeal.
- **Never trust a client-supplied `user_id`** — derive the user from the token.
- **AI chat can create expenses but never update or delete them** — no undo for an LLM mutating the wrong record.
- **Every LLM call goes through `ai_quota_service.py`** (quota + global $ cap). Client model choice is limited to `AI_CHAT_ALLOWED_MODELS`. Quota admin is CLI-only (`varavu_selavu_app/scripts/ai_access.py`), with deliberately no admin UI.
- **Rate limits are per IP and in-memory per instance**; the Postgres-backed AI quota is the real cost guard.
- **Card Coach** counts group spend at the full `amount_paid`, not "my share" (spec §8.2). It defaults to all time, and caps are enforced per calendar window by `CapLedger`. New surfaces should use `compute_coach_report`.
- **Mobile OCR uses a local Expo module, not `@react-native-ml-kit`** — ML Kit's iOS pods break arm64 simulator builds.
- **Alembic revision IDs must be random hex** — `a1b2c3d4e5f6` is taken. Tests and local DBs use `Base.metadata.create_all`.
- **The qa/ Playwright suite runs at the real auth rate limits** (5 logins/min, 5 registrations/hour, in-memory per backend process). The budget is spent exactly, so don't add real logins or registrations to qa tests; stub or use the API (see `qa/README.md`). Restart the backend between local `make release-check-full` runs.
- **Auth: an `Authorization: Bearer` header wins over the `vs_token` cookie, and Bearer requests are exempt from CSRF** (`auth/security.py`, `core/csrf.py`). Native HTTP stacks keep and resend the login cookie, which made every mobile POST 403. Mobile also sends `credentials: 'omit'`; keep both.
- **Mobile is on Expo SDK 57 / React Native 0.86 / React Navigation 7, which needs Xcode 26.4+** (older Xcode fails compiling `expo-modules-jsi`). In RN 7, navigate to a tab from outside `MainTabs` via `navigate('MainTabs', { screen, params })`, never by bare tab name. TypeScript 6 needs `"types"` set explicitly in `tsconfig.json`. iOS 27 kills apps without the UIScene life cycle; `varavu_selavu_mobile/withSceneLifecycle.js` adopts it (Expo's SDK 57 template doesn't) — drop it once on an SDK whose template does (58+).
- **Mobile `npm audit` is gated at high with an allowlist** (`varavu_selavu_mobile/audit-allowlist.json`, checked by `scripts/check-audit.js` from `make audit-mobile`). Only add an entry for an advisory with no patched release that reaches only build/test tooling, with a reason and a `reviewBy` date. Never use `npm audit fix --force` on mobile: it "fixes" these by downgrading Expo.
- **AI chat is topic-restricted** to the user's expenses, TrackSpense how-to and general personal-finance education. A keyword fast path plus a one-word classifier call (`_classify_scope` in `chat_service.py`) refuses everything else with `OFF_TOPIC_REPLY` before the agent runs. It fails open, with the system prompt as backstop. Refusals don't use a daily question (`_settle_chat` refunds, still recording the classifier's cost). Server-built prompts pass `enforce_scope=False`.
- **Group expense PUT: omit `payers` and `split` together to keep the stored split** (rescaled server-side if `amount` changes; `GroupExpenseUpdateRequest`). Never rebuild a split client-side from partial data — the web Expenses page did, and every edit silently moved the whole expense onto the payer.
- **New groups default to `simplify_debts=True`** (existing groups keep theirs). Per-person "owes you" figures anywhere in the UI come from `transfers` involving the viewer, never from another member's group-wide `net`.
- **Card Coach excludes Rent/Mortgage** (`NON_CARD_CATEGORIES`) and reports `default_assumed_spend` so un-attributed spend is shown as an estimate, not rewards earned.
- **In-progress periods compare like-for-like** (`_resolve_comparison_periods`: this month/year vs the same days of the previous one); explicit custom ranges are untouched.
- **iOS push entitlement is stripped by default** (`withDisablePush.js`, so free personal-team builds sign); release builds must set `TRACKSPENSE_ENABLE_PUSH=1`. Every path that creates a group expense (HTTP, recurring, AI chat) must call `NotificationService.fan_out` with `description=` (the key the push text reads).
- **Budget pace never extrapolates fixed bills**: rent/mortgage and expenses matching an active recurring template are carried at face value (`FIXED_BILL_CATEGORIES`, `_fixed_spent_for`), and pace can't flag at_risk/over_pace before day `MIN_PACE_DAYS` (5).
- **"Pending" means an open email invite (`MemberDTO.invite_pending`)**, not `status == "invited"` — every name-only seat is also `invited`.
- **After creating or changing expenses outside the page that owns them, call `refreshExpenseViews(queryClient)`** (`utils/expenseEvents.ts`, web + mobile). React Query matches key prefixes, so `['expenses']` never reaches `['expenses-full-for-combined']` etc.; add new expense-derived query roots to its list.
- **Access tokens are revocable**: `auth_required` checks `users.token_valid_after` against the token's `iat_ms` (one indexed lookup per request). Call `AuthService.end_access_tokens` / `end_all_sessions` on logout, password reset/change, sign-out-everywhere. Browser clients send `X-TrackSpense-Client: web` and get no tokens in JSON bodies; native clients still do.
- **Non-members get 404 "Group not found"** (same as a missing group) — never a distinct 403, which lets group ids be probed.
- **AI consent**: nothing goes to the AI provider before the person agrees (web `utils/aiConsent.ts`, mobile `utils/aiConsent.ts`). Clients send `allow_ai=false` to `/expenses/categorize` and `/ingest/receipt/parse` until then and the server enforces it. Chat is gated client-side only (see ROADMAP).
- **API docs (`/docs`, `/openapi.json`) exist only when `ENVIRONMENT=local`.**
- **Home page product tour uses real screenshots** in `varavu_selavu_ui/public/screenshots/home/<screen>-<light|dark>.jpg` (1440×900 @1.15, demo account). Re-capture both themes when those screens change.
- **Web a11y conventions** (one h1 per page, titles in `RouteA11y.tsx`, named dialogs, announced errors, no nested interactives) are the rules in `.ai-sdlc/standards/accessibility.md` — follow them for any UI change.

- **Expense draft recovery:** structured Quick Capture drafts live in web tab `sessionStorage` / native `SecureStore`, scoped to the account with a 1-hour recovery TTL. Preserve receipt items and custom splits; refresh group membership before save. Success/discard/deliberate local logout clears the draft; auth expiry preserves it. Persist a pending/unknown outcome before a write and require checking Expenses before retrying; never automatically replay a financial write after a connection/timeout/5xx failure.
- **Ask conversation lifetime:** web state belongs above the responsive Drawer (`useChatConversation`); retain pending work on close/breakpoint changes, clear on account change/logout, and mount API-fetching UI lazily. Transport budgets (both clients): ordinary 30s, chat/receipt 120s, refresh 15s including body reads; a transient refresh failure must not sign out the user.
