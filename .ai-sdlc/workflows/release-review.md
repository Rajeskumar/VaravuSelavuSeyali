# Release review workflow

The release reviewer **aggregates evidence; it does not redo reviews**.

## Gather (read, don't recompute)
- Latest CI: `unit.yml`, `qa.yml` on the release commit (`gh run list --commit <sha>` if `gh` is available); local `make release-check` / `release-check-full` results.
- `scripts/quality/verify.sh --full`, `security.sh`, `accessibility.sh` output (run only if no fresh result exists).
- Open P0/P1 findings from earlier reviews or the PR thread; unresolved TODO/FIXME introduced in the range.
- Migrations in the range (order, reversibility, compatibility with the currently deployed code — they run *before* deploy).
- Config/secret/flag changes (`.env.example`, flags, `cloudbuild*.yaml`, Dockerfile).
- Docs: `CHANGELOG.md`, spec, `docs/FEATURE_STATUS.md`; mobile release needs `TRACKSPENSE_ENABLE_PUSH=1` for push builds.
- `checklists/release-checklist.md` — every item ticked or explicitly waived.
- Pushing a `release-*` tag requires the GitHub Actions QA run to have passed on that commit (`scripts/pre-push.sh`).

## Verdict
- **READY** — all checks green, no open P0/P1, checklist complete.
- **READY WITH FIXES** — no P0; named P1/P2 items accepted explicitly with an owner, or small fixes listed that must land first.
- **NOT READY** — any open P0, red required check, unapplied/incompatible migration, missing evidence for a critical journey.

Output: verdict, evidence table (check → status → source), blocking items, accepted risks, exact next steps.
