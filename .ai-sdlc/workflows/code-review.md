# Code-review workflow and finding format

## Procedure (every reviewer)
1. Establish scope: `git diff` / the named files or PR. Review **only** your specialty; skip what another reviewer owns (UX ≠ accessibility ≠ security).
2. Read the applicable `standards/*.md` section(s) only.
3. **Inspect the actual code** (and run read-only checks) before claiming anything. Quote `file:line`.
4. Run or read deterministic results first (`scripts/quality/verify.sh`, `accessibility.sh`, `security.sh`); don't re-derive what a tool already proved.
5. Report using the format below. Do not modify code unless the user asked for fixes.

## Finding format
```
[P1][Confirmed] Short title — path/to/file.tsx:42
Issue: what is wrong (against which standard).
Impact: who is affected and how.
Fix: the concrete change.
```
Severity P0–P3 and Confirmed / Suspected / Improvement are defined in `.ai-sdlc/README.md`. End with: counts per severity, what you did **not** check, and a verdict: `PASS` / `PASS_WITH_APPROVED_WAIVERS` / `BLOCKED` / `INCOMPLETE_EVIDENCE`.

## Substantial PR — order
implementation → product → test → security → accessibility → ux → performance. Pass earlier reviewers' findings forward so later ones don't repeat them. Fix P0/P1 between stages when cheap.

## Deduplication
Each finding belongs to exactly one reviewer. Accessibility owns anything WCAG; UX owns clarity/flow/consistency/copy; security owns authz/injection/secrets/abuse and the privacy-specific data flows in `privacy.md`; implementation owns correctness, structure, parity and migrations' mechanics; test owns coverage/quality of tests; performance owns scaling.

Persist meaningful findings in the work-item findings.json with stable IDs and linked verification.
Follow workflows/validate.md for remediation, current evidence and waiver handling. Do not claim
independent review when applying multiple roles yourself.
