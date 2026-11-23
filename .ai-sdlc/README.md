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
| Portable skills / Claude wrappers | `.agents/skills/`, `.claude/agents/`, `.claude/skills/` symlinks |
| Artifact records, archive and usage | `docs/sdlc/README.md` |
| Current product specs / shared QA references | `docs/`, `docs/qa/` |
| Check profiles / agent setup | `.ai-sdlc/verification.md`, `.ai-sdlc/adapters.md` |
| Executable checks / tests | `scripts/quality/`, `make framework-check` |

## Severity model (all reviewers use exactly this)
- **P0 Blocker** — security vulnerability, data loss/corruption, wrong money, authorization bypass, broken critical journey (sign-in, add expense, settle up), or anything that must stop a release.
- **P1 High** — major functional, accessibility, UX, privacy, reliability or performance defect; fix before release.
- **P2 Medium** — meaningful issue; schedule it, may ship.
- **P3 Low** — polish, consistency, maintainability.

Every finding is labelled **Confirmed** (seen in code/behaviour), **Suspected** (needs inspection or a run), or
**Improvement** (not a defect against a standard). Never present a suspicion as confirmed.

## Review routing

`scripts/quality/route-review.sh [base]` includes committed, staged, unstaged and untracked changes.
`--files <paths...>` supports explicit scope; `--json` produces structured output. Path patterns are a
conservative baseline; inspect behavior and requirements, use `--risk high` or `--product` to escalate.
Tiny changes never bypass risk review. Unknown executable paths get implementation and test review.

| Change | Baseline reviewers / evidence |
|---|---|
| Ordinary docs/copy | none; artifact structure if docs/sdlc |
| Framework policy, skills, scripts | implementation + test + security; framework tests |
| Executable code / API clients | implementation + test |
| UI / product services (new or existing) | + product; UI adds accessibility + UX |
| Auth/OAuth/MCP, APIs, models/migrations, money, AI | + security |
| Heavy queries/analytics/charts | + performance |
| CI/deploy/nested Dockerfiles | implementation + test + security; release-readiness applicability |
| Mobile UI | native evidence; do not substitute web axe for native validation |

Order: implementation → product → test → security → accessibility → UX → performance. Deterministic
checks first. Release readiness aggregates evidence; Deploy execution additionally needs authorization.
