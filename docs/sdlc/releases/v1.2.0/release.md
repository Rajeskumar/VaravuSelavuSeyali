# Release record — v1.2.0

Candidate `c23570369a9399c1a9d0d60932538396e1e6f8e2` on `main`; previous release `release-v1.1.0` (`bddf298`). 57 commits. Authorization, checks and components: release.json.

## Scope and evidence
- Work items: TS-QA-101 (QA CI fixes: Dashboard hero totals, receipt items card collapse, local default dates) — validate gate PASS, 7 routed reviews; TS-SDLC-001 (AI SDLC framework). Follow-up: TS-QA-102 (pre-existing issues, open).
- Exact-candidate CI (release-gate.py PASS): unit 45112177752, QA 45112177860, framework 45112177735.
- Notable contents since v1.1.0: AI SDLC framework and release gates; MCP foundations (default off); non-LLM categorization + receipt OCR (hybrid engine default); AI consent; token revocation; expense date window (no future / >1 year); mobile core/features refactor; security hardening; accessibility fixes.
- Manual UAT limits: no device/native build ships in this release (GCP web + API only); native mobile is unaffected by this deploy.

### Accepted non-blocking risk — waiver W-1
- Finding: commits since v1.1.0 have no routed-review evidence (PRs #43, #44, #45 merged with 0 reviews; 22 direct pushes to main). Severity P2, Confirmed.
- Owner: Rajeshkumar Ganesan (repository owner). Decision: "Waive and release", Claude Code chat 2026-11-23.
- Reason: exact-candidate unit/QA/framework CI, dependency and secret audits, and a migration rehearsal all pass; the waiver covers only missing review evidence. TS-QA-101's changes were fully reviewed.
- Expires: 2026-12-23. Reference: this record; to be added as a finding on a release work item in the post-release documentation commit.

## Rollout and recovery
- Previous images: backend `bddf298` (`…@sha256:a0e63982…`, rev `00127-xwm`), frontend `bddf298` (`…@sha256:31cac227…`, rev `00103-2sm`).
- Schema: 5 additive/widening migrations, rehearsed from the v1.1.0 schema; v1.1.0 code runs on the new schema. Rollback = Cloud Run traffic back to the previous revisions; no downgrade.
- Flags/config: MCP off by default; OCR_ENGINE unset → `hybrid` (backend already 1Gi); CI-check secret provisioned.
- Authorization: Rajeshkumar Ganesan, chat 2026-11-23, for v1.2.0 at this candidate only.

## Execution and production verification
- Tag `release-v1.2.0` pushed 2026-11-23 via `scripts/release.sh` (exact-candidate CI re-checked by the pre-push hook and by both pipelines' `required-ci` step).
- Backend build `4ceb1126-1d70-4ea5-8dcc-b1b39724b053`: SUCCESS (required-ci, audit, build, push, **run-migrations**, deploy). `migrate-db` execution `migrate-db-zqcxh` succeeded 13:49:13Z.
- Frontend build `d35c38b5-6516-40c5-b53f-947462db72e7`: SUCCESS.
- Serving: backend `varavu-selavu-backend-00128-4rj` (`…:c235703`, `sha256:95ca659e…`), frontend `varavu-selavu-frontend-00104-cmg` (`…:c235703`, `sha256:148f3c94…`), each 100% traffic, Ready.
- Read-only prod smoke (`verify.sh --profile production`): 5/5.
- Error signals 13:49Z–13:56Z: no 5xx, no ERROR logs on either revision (light traffic; no SLO defined).
- **Outcome: verified.**

## Follow-up
TS-QA-102 (owner: repository owner): Quick Capture group chips not keyboard-operable (P1), unnamed fields (P2), balances on inactive groups, nested scroll at 400% zoom. Flaky: webkit `search-filter.spec.ts:38` (passed on retry in QA CI).
