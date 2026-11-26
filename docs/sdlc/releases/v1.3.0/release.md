# Release v1.3.0

Candidate `a12ebcf5b11fe4d2e8352960723ccf54da1ccd88` · status **verified**

| Check | Status | Source |
|---|---|---|
| unit-ci | passed | unit.yml: completed/success https://github.com/Rajeskumar/VaravuSelavuSeyali/actions/runs/45625626207 (release-gate) |
| qa-ci | passed | qa.yml: completed/success https://github.com/Rajeskumar/VaravuSelavuSeyali/actions/runs/45625626200 (release-gate) |
| framework-ci | passed | framework.yml: completed/success https://github.com/Rajeskumar/VaravuSelavuSeyali/actions/runs/45625626475 (release-gate) |
| security | passed | unit.yml security job on the candidate: secret scan + dependency audits; Cloud Build re-audits |
| migration-compatibility | passed | No new Alembic revisions since release-v1.2.0 |
| acceptance | waived | Candidate Validate gates: TS-GA4-001, TS-QA-103 and TS-SDLC-002 all INCOMPLETE_EVIDENCE. docs/analytics/verification-report.md confirms test-stream ingestion and production-build consent gates, with broader GA4 reporting and real-SDK scenario evidence open. Native regression reports are being collected separately. |
| reviews | waived | Final candidate routed review evidence is incomplete for TS-GA4-001, TS-QA-103 and TS-SDLC-002; the backend date handling change 5de8ca3 has no linked work item or current review record. |
| native-mobile-e2e | passed | 2026-11-25: local native regression + smoke on candidate a12ebcf, 13/13 flows passed on each platform (receipt-import iOS-only, receipt-ocr-native-android Android-only skipped by design, no retries). Reports: qa/mobile/reports/ios-v130a12ebcf/summary.json, qa/mobile/reports/android-v130a12ebcf/summary.json; build-evidence commit a12ebcf. |
| configuration | passed | 2026-11-25: owner confirmed the production GA4 privacy settings and requested activation in PR #53. Candidate matches G-X3QFP5HNK2 to expense.cerebroos.com with consent required. Read-only GCP inspection confirmed frontend/backend release tag triggers, an enabled GITHUB_ACTIONS_READ_TOKEN version and Secret Manager access for the configured build identity. No new backend runtime settings in this candidate. |
| recovery | passed | Previous serving images recorded; rollback = redeploy them |
| production-smoke | passed | make qa-prod-smoke at 2026-11-25T14:22:58Z (read-only); log .sdlc-logs/prod-smoke-1795616576.log |
| production-errors | passed | 0 error/5xx entries since 2026-11-25T14:12:46Z (max 0); query: resource.type="cloud_run_revision" AND resource.labels.revision_name=("varavu-selavu-backend-00129-7bd" OR "varavu-selavu-frontend-00105-rsj") AND (severity>=ERROR OR httpRequest.status>=500) AND timestamp>="2026-11-25T14:12:46Z" |

| Component | Status | Expected | Observed | Revision | Previous |
|---|---|---|---|---|---|
| backend | deployed | gcr.io/gold-circlet-424313-r7/varavu-selavu-backend:a12ebcf | gcr.io/gold-circlet-424313-r7/varavu-selavu-backend:a12ebcf | varavu-selavu-backend-00129-7bd (sha256:b5e971dc82505e1661deda444da2e678e80f36e6e21f39ccb86efb04cba1956c) | gcr.io/gold-circlet-424313-r7/varavu-selavu-backend@sha256:95ca659e5210ac60b67c3ee658633804f4dfef896acef1cf0bc635a7fc37cc31 gcr.io/gold-circlet-424313-r7/varavu-selavu-backend@sha256:95ca659e5210ac60b67c3ee658633804f4dfef896acef1cf0bc635a7fc37cc31 (revision varavu-selavu-backend-00128-4rj, 100%) |
| frontend | deployed | gcr.io/gold-circlet-424313-r7/varavu-selavu-frontend:a12ebcf | gcr.io/gold-circlet-424313-r7/varavu-selavu-frontend:a12ebcf | varavu-selavu-frontend-00105-rsj (sha256:b259104cd218876d5906ed06a9d330271c71413d6280a796038797e2cccb3e44) | gcr.io/gold-circlet-424313-r7/varavu-selavu-frontend@sha256:148f3c943de2f44b05097ed781b736a843616bdfa638a07e1ccb2208ee2ce3cc gcr.io/gold-circlet-424313-r7/varavu-selavu-frontend@sha256:148f3c943de2f44b05097ed781b736a843616bdfa638a07e1ccb2208ee2ce3cc (revision varavu-selavu-frontend-00104-cmg, 100%) |

Work items: TS-GA4-001, TS-QA-103, TS-SDLC-002

Prepared by release_tools.py at 2026-11-25T13:39:05Z; previous release release-v1.2.0.
