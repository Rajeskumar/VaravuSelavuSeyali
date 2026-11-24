# Implementation plan — TS-SDLC-002

Risk: high (framework gates, permissions, CI and deploy tooling). Branch `chore/ai-sdlc-optimization`.

| Phase | Change | Files |
|---|---|---|
| A quick wins | Tiered routing with explicit Tier-3 paths, exclusions, scope hashes | `scripts/quality/routing.py` |
| A | Summarized verification, logs to `.sdlc-logs/` | `scripts/quality/verification.py`, `.gitignore`, `Makefile` |
| A | Slim AGENTS.md; nested area files | `AGENTS.md`, `*/AGENTS.md`, `*/CLAUDE.md` |
| A | Remove legacy pipeline/pointers | `cloudbuild.yaml`, `.agents/workflows/`, three pointer workflow files; docs updated |
| B automation | Test integrity, docs reminder, release prepare/verify, migration rehearsal | `scripts/quality/test_integrity.py`, `scripts/hooks/docs-touch.py`, `scripts/quality/release_tools.py`, `scripts/quality/migration-rehearsal.sh` |
| B | CI: security + test-integrity jobs, migrations workflow; ruleset draft | `.github/workflows/unit.yml`, `migrations.yml`, `.github/rulesets/main.json` |
| C agents | 4 reviewers, merged skills, generated Codex agents, validator | `.claude/agents/`, `.agents/skills/`, `.codex/agents/`, `scripts/quality/validate-ai-sdlc.py` |
| D governance | Guard hook + settings; light records, scoped evidence, release waivers | `scripts/hooks/guard-bash.py`, `.claude/settings.json`, `.codex/hooks.json`, `scripts/quality/sdlc.py`, schemas, templates |
| E measurement | Usage report, evals | `scripts/quality/usage_report.py`, `scripts/quality/evals/` |

Rollout: no runtime product change. The owner applies the ruleset, trusts the Codex hooks and deletes
the disabled trigger. Recovery: revert the branch; CI/Cloud Build gates are unchanged except for the
added jobs.
