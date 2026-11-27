# Implementation plan

Status: implemented. Requirements: requirements.md; AC text: work-item.json. Written alongside the fix the owner asked for.

## Architecture and contracts
`utils/splitPreview.ts` gains `splitWithRandomRemainder` (integer hundredths) and `addsUpTo`. `SplitEditor` pre-fills with the first;
`SplitEditor` and `PayerPicker` validate with the second. Mobile gets the same `addsUpTo`. No API or data change.

## Risks and safeguards
Money: integer-hundredth arithmetic; the server stays authoritative and unchanged. Stricter client checks block only totals the server
already refuses. Randomness is `Math.random`, used for fairness only, never for security; the chosen values are shown before saving and
stay until the tab is changed. Auth, privacy, migrations, performance: not applicable.

## Ordered tasks
- [ ] T1: failing unit tests, web and mobile
- [ ] T2: web pre-fill and validation
- [ ] T3: mobile validation (parity)
- [ ] T4: browser tests for new, edit and move; spec, coverage map, changelog

## Verification and documentation
test-plan.md and evidence.json. Product spec 10.1 updated.

## Rollout and recovery
Client only; no flag or migration. Web ships with the next release, mobile with the next app build. Recovery: revert the client change.
