# Changelog

Format: `- YYYY-MM-DD: [what changed] (agent: claude-code|codex)`

- 2026-10-02: Fixed backend dependency audit failures by raising PyJWT/urllib3 security floors and locking PyJWT 2.15.1 and urllib3 2.8.0 (agent: codex)
- 2026-10-01: Initial AGENTS.md, CHANGELOG.md, ROADMAP.md, docs/ARCHITECTURE.md and CLAUDE.md (imports AGENTS.md) created (agent: claude-code)
- 2026-10-02: Git hooks: fast pre-commit checks (pytest/tsc by staged area) and pre-push `make release-check` on main; new make targets typecheck-web, typecheck-mobile, precommit-check, install-hooks (agent: claude-code)
- 2026-10-02: Web: react-router-dom 6 -> 7.18.4 (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg) plus lockfile refresh; prod npm audit now clean. Jest moduleNameMapper + TextEncoder polyfill for v7 under CRA's Jest 27 (agent: claude-code)
