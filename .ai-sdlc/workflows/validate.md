# Validate — QA lead and specialist reviewers

1. Capture the final source snapshot; choose fast/integration checks from verification.md and the test plan.
   Run deterministic checks first. Missing dependencies/environment are incomplete evidence, never a pass.
2. Check every AC against behavior and original requirements, not only tests written by the implementer.
   Assess whether tests would fail on regression, whether mocks hide boundaries, and manual/device coverage.
3. Run route-review.sh; apply reviewer skills in code-review.md order. Inspect actual code and evidence.
   Read-only review stays read-only unless fixes were authorized. Preserve reviewer provenance and limits.
4. Persist findings with stable IDs, severity, certainty, owner, source and disposition. Feed authorized
   fixes back to Build, then rerun affected checks/reviewers. After the final source change, refresh the
   required snapshot evidence (the v1 fingerprint is deliberately conservative).
5. Fix/dismissal requires linked current verification. P0 cannot be waived. P1 acceptance needs an explicit
   owner/reason/expiry/reference; unresolved suspected blockers need investigation, not invented certainty.
6. Complete the applicable definition-of-done and docs/qa rows. Run the Validate gate and record results.
   Report what was NOT tested. Validation completion does not authorize deployment.

Default repair limit: two unsuccessful fix/recheck cycles per finding, then explain the remaining issue
and required decision. Do not automatically re-run expensive unrelated suites without a change or concern.
