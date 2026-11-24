# Agent entry points and portability

One tool-neutral layer (AGENTS.md, `.ai-sdlc/`, `.agents/skills/`, `scripts/`) with thin tool adapters.
Phase selection is the agent's judgment per lifecycle.md; tiers and reviewers come from `make route`.

| Environment | Instructions | Skills / reviewers | Guardrail hooks |
|---|---|---|---|
| Claude Code | `CLAUDE.md` imports AGENTS.md; nested `*/CLAUDE.md` import each area's AGENTS.md (loaded when working there) | `.claude/skills/` symlinks; `.claude/agents/` 4 read-only reviewers with preloaded skills, `maxTurns` | `.claude/settings.json`: PreToolUse guard (ask/deny), Stop docs reminder, ask/deny permission rules |
| Codex | AGENTS.md natively; nested AGENTS.md only from the start directory down — root AGENTS.md therefore tells agents to read the area file | `.agents/skills/` natively; `.codex/agents/` **generated** from `.claude/agents` (`make sync-codex`) | `.codex/hooks.json` (trust once via `/hooks`); guard denies ask-class commands unless prefixed `SDLC_GUARD_APPROVED=1` after the user approved in chat |
| GitHub Copilot | `.github/copilot-instructions.md` points to AGENTS.md | Apply skills inline | none |
| Gemini CLI / Antigravity | `GEMINI.md` imports AGENTS.md / root AGENTS.md | Apply skills inline | none |

**Known differences (verified against docs 2026-11-23)**
- Codex cannot sandbox one subagent read-only (`sandbox_mode` is not a per-agent field); run Codex
  reviews in a `codex --sandbox read-only` session. Claude reviewers are read-only via `tools`.
- Codex parses but does not yet support the hook `ask` decision; Claude shows a permission prompt.
- Codex has no `@file` import; Claude needs the nested CLAUDE.md files (validated by `make framework-check`).
- Hooks are guardrails, not a security boundary (`sh -c`, aliases or scripts can evade them); CI and
  Cloud Build remain the enforcement points.

Portable fallback: "Read AGENTS.md and .ai-sdlc/lifecycle.md, then handle this request: …". Missing
tools produce incomplete evidence; never pretend to run a reviewer or deploy tool.

Sources checked 2026-11-23: Claude Code docs (sub-agents, hooks, skills, permissions, monitoring-usage),
Codex docs (AGENTS.md, subagents, hooks, skills); 2026-11-22: Copilot repository instructions, Gemini
context imports, Antigravity workspace rules. `make evals AGENT=claude|codex` checks behavior in each tool.
