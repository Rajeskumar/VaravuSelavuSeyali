---
name: deployment
description: Execute and verify an explicitly authorized release through the existing release tag and GCP pipelines. Readiness-only questions never authorize tagging or deployment.
---

Requires explicit user authorization for this candidate (record it in release.json). Lean by
design: confirm, tag, verify. No test re-runs, audits or review archaeology here.

1. `make release-prepare VERSION=x.y.z` (if not already done) and
   `scripts/quality/sdlc.py release-gate <record>` must be PASS or PASS_WITH_APPROVED_WAIVERS.
2. `scripts/release.sh x.y.z docs/sdlc/releases/vX.Y.Z/release.json` (the guard hook asks the user
   to confirm; answer its prompt only if this release is already authorized).
3. `make release-verify VERSION=x.y.z WAIT=900 SMOKE=1` polls both Cloud Builds, checks the
   traffic-serving revisions and images, runs the read-only prod smoke and the error-log window,
   and sets the record status (verified / verification_incomplete / deployment_failed).
4. On failure: inspect schema compatibility before proposing rollback (previous images are in the
   record); recovery needs authorization. Never replay a tag/deploy whose outcome is unknown.
5. After `verified`, comment the version on linked issues. Policy detail: `.ai-sdlc/workflows/deploy.md`.
