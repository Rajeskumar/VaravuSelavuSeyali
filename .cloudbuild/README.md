# Deploys

Production deploys are driven by **release tags** — merging to `main` does not deploy.

| Pipeline | Build file | Trigger | Deploys |
|:---|:---|:---|:---|
| Backend | `cloudbuild.backend.yaml` | `.cloudbuild/triggers/backend.yaml` | Cloud Run `varavu-selavu-backend` (runs the `migrate-db` job first) |
| Frontend | `cloudbuild.frontend.yaml` | `.cloudbuild/triggers/frontend.yaml` | Cloud Run `varavu-selavu-frontend` |

Both triggers fire on the same `release-vX.Y.Z` tag and run in parallel; each is independent, so
a failure in one does not block the other.

## Releasing

```bash
scripts/release.sh 1.4.0 docs/sdlc/releases/v1.4.0/release.json
```

The tag is the deploy and there is no staging slot. Before using the updated pipelines, provision the
Actions-read Secret Manager credential described in `.ai-sdlc/workflows/deploy.md`. Missing credentials
block the pipeline before any deployment. This repository update does not provision secrets or IAM.

The release script and pre-push hook require unit.yml, qa.yml and framework.yml on the exact candidate
main-branch commit. Cloud Build independently repeats that check before audits/build/migration/deploy.
QA now runs on docs/mobile-only candidates too; evidence is never borrowed from an ancestor.
The local release script also validates a candidate-scoped release record and actual user authorization.
Cloud Build enforces CI; human readiness/authorization records are checked by the release procedure,
not authenticated by JSON fields. Remote branch/tag protections and cloud IAM remain operator controls.

After tag push, follow BOTH build outcomes, migration results and serving revisions; run read-only
production smoke and record the result. Full procedure: `.ai-sdlc/workflows/deploy.md`.

## Images, rollback

Every build pushes `gcr.io/<project>/varavu-selavu-{backend,frontend}` tagged with the commit SHA
(`:<short-sha>`), the release version (`:release-vX.Y.Z`) and `:latest`. Cloud Run always deploys
the SHA tag, so each revision maps to one commit.

Roll back by redeploying an older image — no rebuild needed:

```bash
gcloud run deploy varavu-selavu-backend  --region us-central1 --image gcr.io/gold-circlet-424313-r7/varavu-selavu-backend:release-v1.3.2
gcloud run deploy varavu-selavu-frontend --region us-central1 --image gcr.io/gold-circlet-424313-r7/varavu-selavu-frontend:release-v1.3.2
```

Rolling the backend back does **not** undo database migrations — only ship migrations that the
previous release can still run against.

## Registry retention

`gcr.io/gold-circlet-424313-r7/varavu-selavu-{backend,frontend}` keep only the **newest 10 versions**
each (`.cloudbuild/registry-cleanup-policy.json`, applied to the `gcr.io` Artifact Registry repo in
`us`). It only touches those two images. Rollback therefore reaches back 10 builds/releases; an older
Cloud Run revision whose image was pruned can no longer start new instances.

The policy is applied in **dry-run** mode: it logs what it *would* delete (Cloud Logging, audit
log for `artifactregistry.googleapis.com`) but deletes nothing. After a day or two, review that
log and enforce it:

```bash
gcloud artifacts repositories set-cleanup-policies gcr.io --project=gold-circlet-424313-r7 \
  --location=us --policy=.cloudbuild/registry-cleanup-policy.json --no-dry-run
```

## One-time setup / cutover

The triggers live in GCP, not in git; these files are their source of truth.

```bash
gcloud builds triggers import --project=gold-circlet-424313-r7 --source=.cloudbuild/triggers/backend.yaml
gcloud builds triggers import --project=gold-circlet-424313-r7 --source=.cloudbuild/triggers/frontend.yaml
```

1. ~~Import both triggers~~ — done 2026-09-19 (`varavu-backend-release`, `varavu-frontend-release`, global,
   same build service account as the legacy trigger). Re-run the import commands above to apply later edits.
   The build files are read from the *tagged commit* on GitHub, so commit and push `cloudbuild.backend.yaml` /
   `cloudbuild.frontend.yaml` to `main` before the first `scripts/release.sh`. That first release is a real
   production deploy of both services; there is no dry run.
2. ~~Disable the old `varavuselavuseyali` trigger~~ — disabled (verified 2026-11-22).
3. ~~Delete `cloudbuild.yaml`~~ — deleted 2026-11-23 after the verified v1.2.0 tagged release. The disabled
   trigger can be deleted by an operator (`gcloud builds triggers delete varavuselavuseyali`); if it were
   ever re-enabled it would now fail on the missing file instead of deploying without the CI gate.
