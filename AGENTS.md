# AGENTS.md — Project Memory

## ⚠️ Maintenance (read first)
Before ending a session that changed something meaningful:
1. One line in CHANGELOG.md (date, change, agent/tool). The Stop hook reminds you.
2. New lasting decision/constraint → "Key Decisions" here (cross-cutting) or the area's AGENTS.md.
3. Planned work affected → ROADMAP.md.
4. Feature added/changed → `docs/FEATURE_STATUS.md`; README.md if setup/scope changed;
   `docs/TrackSpense_Complete_Product_Specification.md` for rules/schemas/endpoints/behaviour (edit by
   section; it is large); `docs/features/` for non-trivial specs; `docs/ARCHITECTURE.md` for new services.
Keep this file short (≤ 9 KiB, enforced): decisions and pointers only, detail goes elsewhere.

## Where to look (pull on demand)
- Product overview → README.md; full spec → `docs/TrackSpense_Complete_Product_Specification.md` (grep it)
- Architecture/testing → `docs/ARCHITECTURE.md`; hosting/CI/CD/secrets → `docs/INFRASTRUCTURE.md`
- Built vs not → `docs/FEATURE_STATUS.md`; feature specs → `docs/features/`; QA/UAT → `docs/qa/`
- History → CHANGELOG.md; planned → ROADMAP.md; work records → `docs/sdlc/README.md`
- **Area rules: read the area's AGENTS.md before changing files there** —
  `varavu_selavu_app/AGENTS.md` (backend), `varavu_selavu_ui/AGENTS.md` (web),
  `varavu_selavu_mobile/AGENTS.md` (mobile), `qa/AGENTS.md` (Playwright). Claude loads them
  automatically via their CLAUDE.md; Codex only when started inside that folder.
- Engineering standards → `.ai-sdlc/standards/` (read the one section you need)

## Always
- Web ↔ mobile parity: a fix or feature in one client is checked in the other.
- Git: leave changes uncommitted unless asked; one commit per logical item; never push without asking.
- Guardrails are hooks, not just prose: `scripts/hooks/guard-bash.py` (Claude `.claude/settings.json`,
  Codex `.codex/hooks.json`) asks before push/tags/deploys/hook bypass/alembic on a non-local DB.
- CI (authoritative): `unit.yml` (web/mobile/backend tests, test-integrity, secret scan, audits),
  `qa.yml` (Playwright), `framework.yml`, path-triggered `migrations.yml`. Git hooks (`make install-hooks`)
  are convenience; don't bypass with `--no-verify` unless the user asks.
- Never run migrations or write to a non-local database or production without explicit approval.
  `.env` may point at production.

## Engineering workflow (AI SDLC)
Policy: `.ai-sdlc/README.md`; phases, tiers and authorization: `.ai-sdlc/lifecycle.md`.
**Discover → Plan → Build → Validate → Deploy**, chosen from natural-language intent; explicit phase
limits win. Brainstorming doesn't authorize code; readiness doesn't authorize deployment.
- Deterministic first: `make route` (tier + reviewers), `make check` (changed areas, summary output,
  logs in `.sdlc-logs/`). Use AI review only after checks pass, and only the routed reviewers, once.
- Tiers: trivial (no reviewers) · standard (code reviewer, + UI for screens) · high (auth, money,
  migrations, AI, personal data, CI/deploy, gates/hooks: + security, full record, recorded approval).
  Line count never lowers a tier. Tests assert behavior; bugs fail first; never weaken tests.
- Token hygiene: one session per work item/phase; read big files by section; logs by failing section.
- Done = definition of done + current evidence + docs above. Validated ≠ deployed.
- Board: each work item mirrors to one issue (`.ai-sdlc/github.json`). **Standing authorization
  (this repo/board only):** after plan approval create/update the issue and move it Ready → In
  progress → In review. Done, closing, other repos, commits and pushes need an ask.
- Gates: PASS / PASS_WITH_APPROVED_WAIVERS / BLOCKED / INCOMPLETE_EVIDENCE; missing or stale ≠ pass.
- Deploy: existing release tag + `make release-prepare` / `release-verify`; explicit authorization.

| Intent | Skill |
|---|---|
| brainstorm/explore an idea, requirements | `product-discovery` |
| plan/design/feasibility, test specification | `implementation-planning` |
| implement/add/build/fix/change behavior | `feature-development` |
| validate feature against requirements/tests | `validation` |
| review PR/changes, ready to merge (router) | `pr-review` |
| code correctness, tests, performance | `implementation-review` |
| accessibility/WCAG, UX, responsive, dark mode | `ui-review` |
| acceptance criteria/business rules | `product-review` |
| auth/permissions/data/AI, safe? | `security-review` |
| ready to release? (assessment) | `release-readiness` |
| execute an authorized release | `deployment` |

Claude delegates routed reviews to `code-reviewer`, `ui-reviewer`, `security-reviewer`,
`product-reviewer` (read-only). Codex applies the skills inline. See `.ai-sdlc/adapters.md`.

## Key Decisions (cross-cutting; area decisions live in the area AGENTS.md)
- **AI SDLC**: five phases, repo-local records, risk tiers; deterministic checks before AI review; release readiness never grants deploy authority (`.ai-sdlc/lifecycle.md`).
- **Money is `Decimal`, never float** (`core/money.py`).
- **"Today" is the local date: `todayIso()`** (`utils/expenseDates`, web + mobile), never `toISOString()` (UTC; CI won't catch it).
- **Identity is the user's email** (FK `users.email`) — legacy and pervasive; don't "fix" piecemeal. **Never trust a client-supplied `user_id`**; derive it from the token.
- **AI**: chat can create expenses, never update/delete. Every LLM call goes through `ai_quota_service.py`. Nothing goes to the AI provider before consent (`utils/aiConsent.ts`, web + mobile): the server enforces `allow_ai=false` for categorize/receipt parse; chat is gated client-side only (see ROADMAP).
- **Dashboard totals come from the server's `spend_breakdown`**, never summed `group_summaries` (all groups count, like Analysis).
- **Group expense PUT: omit `payers` and `split` together to keep the stored split**; never rebuild a split client-side from partial data.
- **"Owes you" figures come from `transfers` involving the viewer**, never another member's `net`. New groups default to `simplify_debts=True`. "Pending" = `MemberDTO.invite_pending`, not `status == "invited"`.
- **After changing expenses outside their page, call `refreshExpenseViews(queryClient)`** (`utils/expenseEvents.ts`, web + mobile); add new expense query roots to its list.
- **Expense rules**: no future dates, nothing older than a year (`core/expense_dates.py`, `utils/expenseDates.ts`; edits keep older dates; recurring bypasses). Recurring "Run now" once per template per month. Itemized expenses must reconcile. Last write wins.
- **Adding a member by an email without a verified account is a 400 on the API**; clients then create a placeholder seat and email a join link (web and mobile).
- **Quick Capture drafts** (web `sessionStorage`, native `SecureStore`): per account, 1-hour TTL, keep items/splits, refresh membership before save; success/discard/deliberate logout clears it, auth expiry keeps it; never auto-replay a financial write after a timeout/5xx — persist a pending outcome and check Expenses first.
- **Native mobile E2E** (Maestro on iOS Simulator + Android Emulator, `qa/mobile`) is local, release-time evidence, required only when mobile code changed since the last release (`make release-prepare`); its CI workflow is dormant. It runs a build *variant* (`EXPO_PUBLIC_APP_VARIANT=e2e`) against an isolated local backend only; it never touches `.env`, a developer or production database; simulator/emulator only, real-device checks stay manual. `testID`s are a contract (`varavu_selavu_mobile/AGENTS.md`).
- **Transport budgets (both clients)**: ordinary 30s, chat/receipt 120s, refresh 15s incl. body; a transient refresh failure must not sign out. Ask conversation state lives above the Drawer; clear on account change/logout.
