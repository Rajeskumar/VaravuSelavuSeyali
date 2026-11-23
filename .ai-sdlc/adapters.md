# Agent entry points and portability

Policy lives in AGENTS.md and .ai-sdlc, not copies in tool-specific files. Natural-language phase selection
is performed by the agent following lifecycle.md; there is no magical deterministic keyword classifier.

| Environment | Entry point | Verification |
|---|---|---|
| Codex | AGENTS.md + .agents/skills | Confirm instructions/skill discovery in the running environment |
| Claude Code | CLAUDE.md import + .claude/skills symlinks + read-only reviewer wrappers | Validator checks links/frontmatter; confirm runtime discovery |
| GitHub Copilot | .github/copilot-instructions.md points to AGENTS.md | Check instruction references in the installed surface; capabilities vary |
| Gemini CLI | GEMINI.md imports AGENTS.md | Inspect loaded context; shared workflow works without native delegation |
| Antigravity | Root AGENTS.md (GEMINI.md also available) | Current docs support these workspace rules; verify installed IDE context |

Portable fallback: “Read AGENTS.md and .ai-sdlc/lifecycle.md, then handle this request: …”. Explicit
“Discover”, “Plan”, “Build”, “Validate”, “Deploy readiness” or a skill name can select a starting point.
No portable slash-command behavior is assumed. If discovery is unsupported, explicitly attach/read the
entry point. Missing tools produce incomplete evidence; never pretend to run a reviewer or deploy tool.

Sources checked 2026-11-22:
- [Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
- [Gemini context imports](https://geminicli.com/docs/cli/gemini-md/)
- [Antigravity workspace rules](https://antigravity.google/docs/rules)

Structure validation is automated; runtime discovery across all installed products is not certified by
it. Use evaluations.md for behavioral acceptance and record actual environment/version when exercised.
