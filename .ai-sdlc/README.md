# AI SDLC — shared quality layer

One set of engineering standards for every coding agent (Claude Code, Codex) and every human reviewer.
Tool-specific files hold only discovery metadata and routing; **the policy lives here** and is read on
demand — never preload this folder.

## Where things live
| What | Where |
|---|---|
| Standards (the rules) | `.ai-sdlc/standards/*.md` |
| Workflows and finding format | `.ai-sdlc/workflows/*.md` |
| Checklists | `.ai-sdlc/checklists/*.md` |
| Skills (procedures, both tools) | `.agents/skills/<name>/SKILL.md` — mirrored for Claude by symlinks in `.claude/skills/` |
| Claude subagents (isolated, read-only reviewers) | `.claude/agents/<role>-reviewer.md` — thin wrappers over the skills |
| Deterministic checks and routing | `scripts/quality/` |
| Entry point for all agents | root `AGENTS.md` (Claude reaches it via the one-line `CLAUDE.md` import) |

## Lifecycle
requirement → acceptance criteria → plan → implement → focused tests → self-review → routed reviews → fixes →
full checks → PR readiness → release readiness. Detail: `workflows/feature-development.md`, `bug-fix.md`.

## Severity model (all reviewers use exactly this)
- **P0 Blocker** — security vulnerability, data loss/corruption, wrong money, authorization bypass, broken critical journey (sign-in, add expense, settle up), or anything that must stop a release.
- **P1 High** — major functional, accessibility, UX, privacy, reliability or performance defect; fix before release.
- **P2 Medium** — meaningful issue; schedule it, may ship.
- **P3 Low** — polish, consistency, maintainability.

Every finding is labelled **Confirmed** (seen in code/behaviour), **Suspected** (needs inspection or a run), or
**Improvement** (not a defect against a standard). Never present a suspicion as confirmed.

## Routing (run only what the change warrants)
`scripts/quality/route-review.sh [base]` classifies the diff and prints the reviewers. Summary:

| Change | Reviewers |
|---|---|
| Typo, copy, docs, comments | none — deterministic checks only |
| Style-only (CSS/theme tokens) | `accessibility-review` only if colour, focus or sizing changed |
| UI component/page (web or mobile) | implementation + test + ux + accessibility |
| New user-facing feature | + product |
| Auth, endpoints, permissions, uploads, CSRF/CORS | implementation + test + security |
| DB model / Alembic migration | implementation (migration checklist) + test + security (privacy/authz) |
| Heavy query, aggregation, list endpoint, bundle/chart work | implementation + test + performance |
| LLM / AI quota / chat tools | implementation + test + security |
| CI, Docker, Cloud Build, deploy config | implementation + security + release |
| Release candidate | `release-readiness` (aggregates; does not redo reviews) |

## Review order for a substantial PR
implementation → product → test → security → accessibility → ux → performance → release-readiness.
Run deterministic checks (`scripts/quality/verify.sh`) **before** any AI review.
