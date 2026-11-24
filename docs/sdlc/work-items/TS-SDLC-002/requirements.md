# Requirement agreement — TS-SDLC-002

Status: agreed. Owner and acceptance criteria: work-item.json (AC-001..AC-010).

## Problem and users
The AI SDLC framework (TS-SDLC-001) is used by the repository owner with Claude Code and Codex. The
2026-11-23 audit found:
- routing labelled 33 of 40 November commits high risk (20 got 6–7 reviewers);
- policies were advisory only (no hooks, `main` unprotected, red QA reached release);
- `verify.sh` streamed full logs into agent context;
- 8 duplicated reviewer agents walked a 5-file instruction chain;
- a 17 KB AGENTS.md loaded into every session and subagent.

Measured from local logs: subagents were about 0.6% of cache reads. Long main sessions and large tool
results dominate cost.

## Outcome and scope
Minimum necessary AI involvement with equal or stronger quality and security:
- deterministic checks first, with summarized output;
- risk tiers from explicit paths;
- 3+1 reviewers, run once each and skipped when their scope is unchanged;
- guardrails as hooks and CI;
- scripted release prepare/verify;
- migration rehearsal in CI;
- usage measurement and evals.

Exclusions:
- applying the GitHub ruleset (prepared, needs the owner);
- deleting the disabled GCP trigger;
- a per-edit formatter hook (no formatter is configured in the repo; adding one would reformat code);
- coverage, Lighthouse and visual regression (not worth it now).

## Decisions
- Plan approved by the owner: "Let's go ahead with this plan. Create new branch from main and
  implement all these changes. Don't commit to branch yet."
- Codex cannot sandbox a subagent or honour hook "ask", so ask-class commands are denied there unless
  the agent prefixes `SDLC_GUARD_APPROVED=1` after explicit chat approval (documented as prompt-level).
