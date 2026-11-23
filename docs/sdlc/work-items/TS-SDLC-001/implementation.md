# Implementation plan

Status: authorized by the current conversation. See requirements.md and AC IDs in work-item.json.

1. Preserve current product code and existing PG/axe QA coverage. Add lifecycle phase contracts and
   reusable schemas/templates. Standard-library orchestration; jsonschema/PyYAML isolated tooling deps.
2. Implement conservative reviewer routing and named verification profiles, with explicit local DB
   prerequisites; never infer safety from line count. Retain wrapper entry points.
3. Implement work-item initialization, structure validation, source/plan fingerprints and fail-closed
   evidence gates. Ledger assertions are not authenticated approval or proof of execution.
4. Update shared skills and thin discovery adapters. Record realistic natural-language evaluation cases.
5. Add exact-candidate CI gate to local release paths and as first step of both Cloud Build pipelines.
   Require read-only GitHub credential via Secret Manager; document provisioning as an owner prerequisite.
6. Test framework behavior, review implementation/product/test/security concerns, fix defects, record
   final evidence; update README/roadmap/changelog and QA release links.

Risks: falsely fresh evidence, permissive routing, fabricated approvals, local-hook bypass, partial
release, secret leakage and artifact self-reference. Controls: content hashes, conservative matching,
actual-user-source checks, server CI gate, independent component evidence, no secret values in reports.
No application/API/schema/mobile behavior changes; web/mobile parity is not affected.

Verification: required_evidence in work-item.json. Local deterministic tests plus read-only reviews and
behavior evaluation. Full application suites are unnecessary for framework-only code; CI/deploy YAML is
parsed/tested locally but live execution and external tool discovery remain unverified rollout checks.

Rollout: leave edits uncommitted for owner review. Before a future tag: commit/push when authorized,
observe all three CI workflows, provision read-only GitHub secret/access, then use release records/script.
Recovery: revert framework changes in a separately authorized change if needed; do not bypass live gates.
