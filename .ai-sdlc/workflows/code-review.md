# Code-review workflow and finding format

## Procedure (every reviewer)
1. Establish scope: the file list routing gave you (`route-review.sh --json` `scopes`), else `git diff`. Review **only** your specialty; read each file once.
2. Read the applicable `standards/*.md` section(s) only.
3. **Inspect the actual code** (and run read-only checks) before claiming anything. Quote `file:line`.
4. Read deterministic results first (`make check` summary, CI, `accessibility.sh`, `security.sh`); don't re-derive what a tool already proved or re-run suites that passed on this content.
5. Report using the format below. Do not modify code unless the user asked for fixes.

## Finding format
```
[P1][Confirmed] Short title — path/to/file.tsx:42
Issue: what is wrong (against which standard).
Impact: who is affected and how.
Fix: the concrete change.
```
Severity P0–P3 and Confirmed / Suspected / Improvement are defined in `.ai-sdlc/README.md`. End with: counts per severity, what you did **not** check, and a verdict: `PASS` / `PASS_WITH_APPROVED_WAIVERS` / `BLOCKED` / `INCOMPLETE_EVIDENCE`.

## Order and ownership
Order: implementation → product → security → UI; independent reviewers may run in parallel.
Each finding belongs to exactly one reviewer:
- **implementation-review**: correctness, structure, parity, migration mechanics, test adequacy, performance (when focused).
- **ui-review**: WCAG (`[a11y]`) and clarity/flow/consistency/copy (`[ux]`).
- **security-review**: authz, injection, secrets, abuse, and the privacy data flows in `privacy.md`.
- **product-review**: acceptance criteria, business rules, cross-screen numbers, scope.

Persist meaningful findings in the work-item findings.json with stable IDs and linked verification.
Follow workflows/validate.md for remediation, current evidence and waiver handling. Do not claim
independent review when applying multiple roles yourself. P2/P3 become follow-ups unless cheap.
