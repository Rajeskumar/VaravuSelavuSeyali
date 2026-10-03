# Changelog

Format: `- YYYY-MM-DD: [what changed] (agent: claude-code|codex)`

- 2026-10-02: Fixed backend dependency audit failures by raising PyJWT/urllib3 security floors and locking PyJWT 2.15.1 and urllib3 2.8.0 (agent: codex)
- 2026-10-01: Initial AGENTS.md, CHANGELOG.md, ROADMAP.md, docs/ARCHITECTURE.md and CLAUDE.md (imports AGENTS.md) created (agent: claude-code)
- 2026-10-02: Git hooks: fast pre-commit checks (pytest/tsc by staged area) and pre-push `make release-check` on main; new make targets typecheck-web, typecheck-mobile, precommit-check, install-hooks (agent: claude-code)
- 2026-10-02: Web: react-router-dom 6 -> 7.18.4 (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg) plus lockfile refresh; prod npm audit now clean. Jest moduleNameMapper + TextEncoder polyfill for v7 under CRA's Jest 27 (agent: claude-code)
- 2026-10-02: release-check green locally: shared QA_RUN_ID in make qa-all; fixed real bugs found by qa/ (blank payment handles 422'd every profile save on web+mobile; profile form overwrote early edits; malformed expense id 500 -> 404; empty web login hit the server); fixed broken RegisterPage locator; rebalanced the 5/min login budget (agent: claude-code)
- 2026-10-02: release-check is now pytest + audits only (qa-all moved to release-check-full); pre-push refuses release-* tag pushes unless GitHub Actions QA passed on the tagged commit (agent: claude-code)
