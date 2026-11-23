# Verification profiles

Install framework dependencies in a local virtual environment:

```sh
python3 -m venv .venv-sdlc
.venv-sdlc/bin/pip install -r scripts/quality/requirements.txt
export SDLC_PYTHON="$PWD/.venv-sdlc/bin/python"
make framework-check
scripts/quality/verify.sh --profile fast --dry-run
```

| Profile | Automated scope | Prerequisites / remaining evidence |
|---|---|---|
| fast (default) | Changed-area unit/lint/types; framework validation/tests; secret scan where relevant | Installed dependencies; reviewers and acceptance checks still required |
| integration | Postgres tests, local QA smoke/regression/API/account and axe | Dedicated initialized local test DB, local web/backend, clean auth rate-limit budget |
| release (`--full` alias) | All fast checks + build + integration + cross-browser + dependency audits | Same local setup, installed browsers; device/UAT, migration rehearsal, config/recovery and live CI evidence |
| production | Existing read-only production smoke only | Explicit request to validate production; versions/builds/error signals are separate operator checks |

Use `--files <paths...>` for a precisely scoped check or `--base <ref>` for a PR; default diff includes
committed branch changes, staged, unstaged and untracked files against origin/main (else main).
`--all-areas` checks every area in fast mode; `--build` adds the web build. Unknown flags/refs fail.
`--dry-run` shows commands without executing. A successful profile is not a full release verdict.

Integration/release requires `SDLC_TEST_ENV=local` and `E2E_DATABASE_URL` pointing to an initialized,
throwaway localhost Postgres DB (schema/pg_trgm/tables as in unit.yml backend-postgres). See qa/README.md
for the local stack. No production database. Separate pytest processes avoid cross-module overrides.
The QA run ID is shared throughout a profile; account tests get their own rate-limit time window.
Restart the backend before another full profile. Native device evidence remains manual (ROADMAP).
CI already includes PG and axe; release readiness may consume current CI instead of rerunning expensive
local suites. Record exactly which environments/checks supplied the evidence; never label a fast run full.
