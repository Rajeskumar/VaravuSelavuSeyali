# Deploy — release engineer

## Readiness (read-only)

Use release-review.md and release-checklist.md. Freeze a candidate commit on main, identify applicable
work items and review the actual evidence. `scripts/quality/release-gate.py --sha <full-sha>` checks the
latest eligible main push/manual runs of unit.yml, qa.yml and framework.yml on that exact commit.
A PR-only run, missing/skipped/red/pending run or inaccessible API blocks release. No ancestor fallback.

Prepare docs/sdlc/releases/vX.Y.Z/release.json and release.md from templates AFTER freezing the candidate.
Keep this new record untracked until release results can be committed in a later documentation change;
do not alter the frozen source to attach its own commit SHA. The release script allows only untracked
files within that version's release directory. A record already tracked with edits must be saved through
an appropriate documentation commit and the candidate/evidence refreshed before another release.

Populate checks: unit-ci, qa-ci, framework-ci, security, acceptance, reviews, migration-compatibility,
configuration, recovery. A not-applicable manual check is passed only after an explicit applicability
assessment with a source/reason. Skipped/missing is incomplete. Include web/backend components, previous
images and expected new images. Review linked work-item gates and any waivers; JSON is not authenticated
proof. The gate reports its limits: linked work-item contents/waivers and actual approval sources require manual review.
The release gate requires every declared release check to pass; it cannot waive failed CI.

## Authorization and execution

“Ready to release?” authorizes assessment only. For execution, record actual user authorization for the
candidate (existing explicit authorization can be reused). The local release gate checks the record;
it does not fabricate authorization. Do not create a tag or push without actual authorization.

```sh
scripts/release.sh 1.4.0 docs/sdlc/releases/v1.4.0/release.json
```

The script checks main/clean source/origin alignment, record/candidate/version, required CI and asks for
confirmation before tagging/pushing. An agent may answer that confirmation only when the user has already
authorized this release. Tag push triggers the existing independent backend/frontend GCP pipelines.
Cloud Build repeats the exact-commit CI gate before audit/build/migration/deploy; local hooks are optional
convenience, not the enforcement boundary. Branch/tag and cloud IAM protections are still operator-owned.

## One-time credential prerequisite (operator action; no live settings changed by framework setup)

Before releasing a commit containing the new Cloud Build config, provision Secret Manager secret
GITHUB_ACTIONS_READ_TOKEN with a fine-grained GitHub token restricted to this repository, Actions read
(and required metadata access). Grant the Cloud Build identity secretAccessor on ONLY this secret.
Both cloudbuild files inject it as GH_TOKEN only for the CI-check step. Never store the token in Git,
release records, commands echoed to logs, or user chat. Rotate it through Secret Manager.
Missing secret/access/token or GitHub outage fails closed. Run the gate locally and verify the three
workflows exist/passed before the first tag. No CI run can exist for uncommitted code.

## Monitor both independent deployments

Use available authenticated GCP read tools/CLI. Resolve builds by the exact release tag/commit and the
appropriate trigger, then poll their actual build IDs until completed; never infer success from push.
Record both build URLs/statuses and backend migration-step result. A failure in one is a partial release,
not overall success. On timeout retain verification_incomplete and report what remains running.

Useful read-only commands (replace placeholders with observed IDs):

```sh
gcloud builds list --project=gold-circlet-424313-r7 --filter='substitutions.TAG_NAME=release-v1.4.0' --format=json
gcloud builds describe BUILD_ID --project=gold-circlet-424313-r7 --region=REGION --format=json
gcloud run services describe varavu-selavu-backend --project=gold-circlet-424313-r7 --region=us-central1 --format=json
gcloud run services describe varavu-selavu-frontend --project=gold-circlet-424313-r7 --region=us-central1 --format=json
```

Inspect actual traffic-serving revision(s), readiness and revision image/digest; latest-created alone is
insufficient. Resolve tag/digest equivalence from build/registry evidence and record canonical image
identities consistently in expected_image/observed_image. Confirm both revisions match the candidate.
If gcloud/credentials are unavailable, report incomplete evidence; do not assume a deployment completed.

## Production validation and outcome

Run `scripts/quality/verify.sh --profile production` only when production validation is in scope. This
uses the existing read-only prod smoke (home, login rendering, health/config, 404), never auth or writes.
Check read-only error signals for the serving revisions over a stated observation window (initially
5 minutes, compare with pre-release baseline where available). Record query/time/source and limitations
as production-errors; do not claim an SLO without a defined budget. Additional feature smoke must be
read-only or follow an explicitly authorized synthetic-account procedure. Never run the normal QA suites
against production. Native store releases need separate build/device/store evidence; GCP proves no native
binary. Complete release-gate --production only with observed component and smoke/error evidence.

Outcomes: deployment_failed, verification_incomplete, verified. Persist evidence, follow-ups and outcome;
update product release status only after verified. On failure inspect schema compatibility before
proposing rollback/roll-forward. Automatic rollback is not enabled; obtain recovery authorization unless
already explicitly granted. Do not replay a tag/deploy whose outcome is unknown.
