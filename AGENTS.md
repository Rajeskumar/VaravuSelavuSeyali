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

## Always
- Web ↔ mobile parity: a feature or fix in one client must be checked in the other.
- Git: leave changes uncommitted unless asked; one commit per logical item; never push without asking.
- Git hooks (`make install-hooks`): commits to main run fast checks for the staged areas; pushes to main run `make release-check` (pytest + audits); pushing a `release-*` tag requires the GitHub Actions QA run to have passed on that commit. Don't bypass with `--no-verify` unless the user asks.

## Key Decisions
- **Money is `Decimal`, never float** (`core/money.py`) — float totals produced rounding artifacts.
- **The user's identity is their email** (FK `users.email`), not `users.id`. This is legacy and pervasive, so don't "fix" it piecemeal.
- **Never trust a client-supplied `user_id`** — derive the user from the token.
- **AI chat can create expenses but never update or delete them** — no undo for an LLM mutating the wrong record.
- **Every LLM call goes through `ai_quota_service.py`** (quota + global $ cap). Client model choice is limited to `AI_CHAT_ALLOWED_MODELS`. Quota admin is CLI-only (`scripts/ai_access.py`), with deliberately no admin UI.
- **Rate limits are per IP and in-memory per instance**; the Postgres-backed AI quota is the real cost guard.
- **Card Coach** counts group spend at the full `amount_paid`, not "my share" (spec §8.2). It defaults to all time, and caps are enforced per calendar window by `CapLedger`. New surfaces should use `compute_coach_report`.
- **Mobile OCR uses a local Expo module, not `@react-native-ml-kit`** — ML Kit's iOS pods break arm64 simulator builds.
- **Alembic revision IDs must be random hex** — `a1b2c3d4e5f6` is taken. Tests and local DBs use `Base.metadata.create_all`.
- **The qa/ Playwright suite runs at the real auth rate limits** (5 logins/min, 5 registrations/hour, in-memory per backend process). The budget is spent exactly, so don't add real logins or registrations to qa tests; stub or use the API (see `qa/README.md`). Restart the backend between local `make release-check-full` runs.
- **Auth: an `Authorization: Bearer` header wins over the `vs_token` cookie, and Bearer requests are exempt from CSRF** (`auth/security.py`, `core/csrf.py`). Native HTTP stacks keep and resend the login cookie, which made every mobile POST 403. Mobile also sends `credentials: 'omit'`; keep both.
