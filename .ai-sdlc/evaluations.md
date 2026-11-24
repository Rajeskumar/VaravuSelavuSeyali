# Framework evaluations and cost tracking

Run after changing AGENTS.md, skills, agents, hooks or routing. Scenarios live in
`scripts/quality/evals/scenarios.json` (docs-only, minor UI, backend/API, auth, migration, critical
bug fix, release candidate, untrusted issue text).

| Command | Cost | What it checks |
|---|---|---|
| `make evals` (also in `make framework-check`/CI) | free | Each scenario routes to the expected tier, reviewers and checks |
| `make evals AGENT=claude` / `AGENT=codex` | tokens | Behavior in plan/read-only mode inside a temporary worktree; logs to `.sdlc-logs/evals/` |
| `make usage-report SINCE=YYYY-MM-DD` | free | Tokens, subagent share, agent/skill invocations, large tool results from local session logs (numbers only) |

Behavioral hints (`expect_any`, `forbid`) are coarse; a human scores the transcript. Record
model/tool/version, observed behavior and failures below. Turn every escaped defect or incident into
a new scenario. Two unsuccessful repair cycles require escalation, not a loop. Never invent metrics.

For priced totals use Claude Code `/usage`, or OTel (`CLAUDE_CODE_ENABLE_TELEMETRY=1`; metrics
`claude_code.token.usage` and `claude_code.cost.usage`, attributes `agent.name`, `skill.name`).

## Metrics to compare before/after a framework change
Tokens per completed work item · agent invocations per PR · reviews repeated without a scope change ·
first-pass CI success · share of findings acted on · escaped defects · time to completion.

## Results log

| Date | Tool / model | Suite | Result | Notes |
|---|---|---|---|---|
| 2026-11-23 | routing (deterministic) | 8 scenarios | 8/8 PASS | TS-SDLC-002 |
| 2026-11-23 | usage baseline (Claude Code, 10 sessions Jul–Nov) | usage-report | subagents 0.6% of cache-read, ~3% of output tokens; 9 reviewer calls in 2 sessions | Baseline before TS-SDLC-002; long main sessions and large Reads dominate |
