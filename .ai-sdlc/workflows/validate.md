# Validate — QA lead and specialist reviewers

1. Capture the final source snapshot; run `make check` (summary output) and use CI for integration
   evidence. Missing dependencies/environment are incomplete evidence, never a pass.
2. Check every AC against behavior and original requirements, not only tests written by the implementer.
   Assess whether tests would fail on regression, whether mocks hide boundaries, and manual/device coverage.
3. `make route`; run each routed reviewer once on its scope (skip one whose recorded evidence the gate
   still reports current), in code-review.md order. Inspect actual code and evidence.
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

Board status: when validation starts run `sdlc.py github status TS-ID in_review --apply`. A passing gate
leaves the card In review; Done comes from the merged-PR project workflow or the owner's instruction
(`--allow-done`), because it closes the issue. Findings that block go on the card as `blocked` with a reason.
