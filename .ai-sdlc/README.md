# AI SDLC — shared lifecycle

Natural-language entry: read AGENTS.md and lifecycle.md; select **Discover → Plan → Build → Validate → Deploy**
within the user's requested scope. No keyword or slash command is required. Phase-specific skills are
optional explicit entry points. The framework is repository-local and agent-assisted; it does not run a
background orchestrator or grant execution permissions.

## Map

| Content | Location |
|---|---|
| Phase contracts, risk, authorization, freshness | `.ai-sdlc/lifecycle.md` |
| Phase procedures and review ownership | `.ai-sdlc/workflows/` |
| Engineering standards | `.ai-sdlc/standards/` |
| Checklists, reusable templates, JSON schemas | `.ai-sdlc/checklists/`, `.ai-sdlc/templates/`, `.ai-sdlc/schemas/` |
| Portable skills / reviewer agents | `.agents/skills/` (source), `.claude/skills/` symlinks, `.claude/agents/` (4 reviewers), `.codex/agents/` (generated) |
| Artifact records, archive and usage | `docs/sdlc/README.md` |
| Current product specs / shared QA references | `docs/`, `docs/qa/` |
| Check profiles / agent setup | `.ai-sdlc/verification.md`, `.ai-sdlc/adapters.md` |
| Executable checks / tests / hooks | `scripts/quality/`, `scripts/hooks/`, `make check`, `make framework-check` |

## Severity model (all reviewers use exactly this)
- **P0 Blocker** — security vulnerability, data loss/corruption, wrong money, authorization bypass, broken critical journey (sign-in, add expense, settle up), or anything that must stop a release.
- **P1 High** — major functional, accessibility, UX, privacy, reliability or performance defect; fix before release.
- **P2 Medium** — meaningful issue; schedule it, may ship.
- **P3 Low** — polish, consistency, maintainability.

Every finding is labelled **Confirmed** (seen in code/behaviour), **Suspected** (needs inspection or a run), or
**Improvement** (not a defect against a standard). Never present a suspicion as confirmed.

## Review routing (deterministic first, then only the reviewers a change needs)

`make route` (`scripts/quality/route-review.sh [base] [--json] [--files ...] [--risk high] [--product]`)
covers committed, staged, unstaged and untracked changes, excludes generated/scratch paths, and
returns the tier, reviewers, per-reviewer file scopes with content hashes, a `focus` (e.g.
performance) and check categories. Paths set a conservative baseline; escalate on behavior, never drop.

| Tier | Typical paths | Reviewers (one pass each) |
|---|---|---|
| trivial | docs, copy, images, CHANGELOG | none — deterministic checks only |
| standard | application code, tests, qa/, framework docs and skills | `implementation-review` (+ `ui-review` for screens/styles, + `security-review` for endpoints) |
| high | auth/oauth/mcp, backend core/db, alembic, money/LLM/export services, client auth transport, CI/deploy, gates, hooks and permission settings | + `security-review`; full record and recorded approval |

`product-review` runs when the work item is a new user-facing feature or rule change (`--product`).
Dependency manifests trigger the deterministic audit, not a reviewer. Mobile UI needs native evidence;
web axe is no substitute. A reviewer whose scope hash matches its current evidence is skipped.
Order: implementation → product → security → UI. Release readiness aggregates evidence
(`make release-prepare`); Deploy execution additionally needs authorization.

## Guardrails and measurement
Hooks enforce what prose cannot: `scripts/hooks/guard-bash.py` (push, tags, deploys, hook bypass,
alembic on a non-local DB, force-push, forced audit fixes) and a non-blocking CHANGELOG reminder,
wired in `.claude/settings.json` and `.codex/hooks.json`. CI enforces test integrity, secret scanning
and audits. `make usage-report` measures tokens and agent use; `make evals` checks routing and,
on request, agent behavior (`.ai-sdlc/evaluations.md`).
