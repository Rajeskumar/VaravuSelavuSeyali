# Release readiness — assessment only

Aggregate original evidence without repeating current checks unnecessarily. Identify candidate commit,
work items and component release scope. Use checklists/release-checklist.md and docs/qa/08-release-readiness-checklist.md
for applicable QA evidence. Read-only review never authorizes a tag, push or production change.

- Check exact-candidate main-branch CI for unit.yml, qa.yml and framework.yml with release-gate.py.
- Review current work-item acceptance, deterministic checks, routed reviews and finding dispositions.
- Verify security/audits, migration rehearsal and previous-code compatibility, configuration/flags/secrets,
  native/device evidence where applicable, and recovery plan/previous image availability.
- Review docs and feature status; distinguish implemented from released.
- Fill release records from actual evidence, with source links and explicit omissions. Missing evidence
  stays missing; obtain only missing checks within authorized scope, not an unbounded full rerun.

Use lifecycle verdicts: PASS / PASS_WITH_APPROVED_WAIVERS / BLOCKED / INCOMPLETE_EVIDENCE. P0 cannot be
waived; P1 needs explicit valid acceptance and owner, never an unlanded required fix disguised as ready.
The release execution gate requires all mandatory checks to pass; record accepted risks in the review
source behind its reviews check. Output evidence table, blocking/missing items, waivers and next actions.
For authorized execution and production verification continue to workflows/deploy.md.
