# Verification profiles

Deterministic checks come before any AI review, and CI is the authoritative enforcement point.
Local runs exist to iterate quickly; don't re-run locally what CI already ran on the same content.

```sh
python3 -m venv .venv-sdlc && .venv-sdlc/bin/pip install -r scripts/quality/requirements.txt
export SDLC_PYTHON="$PWD/.venv-sdlc/bin/python"
make framework-check            # validator, records, framework unit tests (incl. routing evals)
make route                      # tier, reviewers, per-reviewer scopes and hashes
make check                      # = scripts/quality/verify.sh --profile fast
```

| Entry point | Automated scope | Notes |
|---|---|---|
| `make check` (fast) | Changed-area unit/lint/types, framework validation, secret scan where relevant, dependency audit when a manifest changed, test integrity | Keeps going after a failure so one run shows every failure |
| `--profile integration` | Postgres tests, local QA smoke/regression/API/account and axe | Dedicated initialized local test DB, local web/backend, clean auth rate-limit budget |
| `make check-full` (release) | All fast checks + build + integration + cross-browser + audits | Same setup; device/UAT, config and live CI evidence remain separate |
| `--profile production` | Existing read-only production smoke only | Only when production validation is in scope |
| `make migration-rehearsal` | New Alembic revisions on the previous release's schema, downgrade, re-apply | Throwaway localhost DB; CI runs it via `migrations.yml` |

**Output contract.** Each command prints one line (`PASS`/`FAIL`, duration, log path); a failure adds
at most 20 relevant lines. Full logs and `summary.json` go to `.sdlc-logs/<profile>-<run>/`
(gitignored). Agents open only the failing section of a log. `--stream` restores raw output;
`--stop-on-failure` stops at the first failure; `--dry-run` lists the commands.

Use `--files <paths...>` for a precise scope or `--base <ref>` for a PR; the default diff includes
committed branch changes, staged, unstaged and untracked files against origin/main (else main),
minus generated/scratch paths. Unknown flags/refs fail. A green profile is not a release verdict.

Integration/release need `SDLC_TEST_ENV=local` and `E2E_DATABASE_URL` pointing to an initialized,
throwaway localhost Postgres DB (schema/pg_trgm/tables as in unit.yml backend-postgres); see
qa/README.md. Never a production database. Restart the backend before another full profile.
Native device evidence remains manual. Record exactly which environments supplied the evidence;
never label a fast run full.

**Where each check is enforced**

| Check | Local | CI (authoritative) | Release |
|---|---|---|---|
| Unit/lint/types | `make check`, pre-commit (main) | `unit.yml` | release-gate requires green CI |
| Test integrity | `make check`, pre-commit (all branches) | `unit.yml` test-integrity | via unit-ci |
| Secret scan + audits | `make check` (when relevant), pre-push | `unit.yml` security | Cloud Build re-audits |
| Browser/API/axe | integration profile | `qa.yml` | release-gate |
| Migrations | `make migration-rehearsal` | `migrations.yml` (path-triggered) | `release-prepare` reads it |
| Guardrails | hooks in `.claude/settings.json`, `.codex/hooks.json` | — | `release.sh` confirmation |
