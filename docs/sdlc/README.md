# SDLC work history

Current product knowledge stays in the existing docs (spec, architecture, feature specs and docs/qa).
This directory holds change history: work-items/<ID>/, releases/<version>/ and archive/. Framework
policy/templates live in .ai-sdlc; executable checks in scripts/quality. GitHub Issues/Projects are optional
links/dashboards, not requirements or gate authorities. No separate service/database is required.

## Start and resume

After installing scripts/quality/requirements.txt in a venv (see .ai-sdlc/verification.md):

```sh
$SDLC_PYTHON scripts/quality/sdlc.py init TS-123 --title 'Feature outcome' --risk standard
$SDLC_PYTHON scripts/quality/sdlc.py validate
$SDLC_PYTHON scripts/quality/sdlc.py gate docs/sdlc/work-items/TS-123 --phase plan
$SDLC_PYTHON scripts/quality/sdlc.py plan-fingerprint docs/sdlc/work-items/TS-123
$SDLC_PYTHON scripts/quality/sdlc.py snapshot
$SDLC_PYTHON scripts/quality/sdlc.py gate docs/sdlc/work-items/TS-123 --phase validate
```

The CLI creates a work-item record plus requirement, implementation and test-plan templates and empty
findings/evidence ledgers. The templates are guidance, not approved plans. Replace their content; enter
observable ACs in work-item.json. required_evidence lists expected IDs for checks, reviewers and manual
acceptance verification selected during Plan. Do not reduce that list merely to get a pass.
For high risk, record actual existing user authorization and the plan-fingerprint, never invent approval.
The gate command checks the EXIT evidence of a phase, except Build also checks authorization before code.

Record evidence after execution with: id, passed/failed/skipped status, source snapshot, environment,
command_or_method, source report/CI link, recorded_at (UTC timestamp), and covered AC IDs. Validate
source evidence and coverage, not just ledger syntax. Use one current entry per evidence ID; preserve
old detailed reports in archived summaries or Git history. Current code changes stale prior snapshots.
Do not run local validation against historical records and rewrite them as newly passing.

Gate outcomes: PASS, PASS_WITH_APPROVED_WAIVERS, BLOCKED, INCOMPLETE_EVIDENCE. They are calculated, not
stored as a freely editable success switch. Editing phase/status never advances a gate. A high-risk plan
change invalidates its approval; a source/plan change invalidates required execution evidence.

## Storage and archive

Use stable TS-* IDs (uppercase letters, numbers, hyphens), one folder per meaningful change. Keep relative
links within each folder; links to code include repository/path and the full tested commit when committed,
or a source snapshot for local work. Worktree snapshots are conservative and exclude artifact ledgers and
reports to avoid circular hashes. Source plans stay included. Ignore build outputs via .gitignore.

Keep durable decisions, ACs, plans, findings and concise evidence summaries. Do not commit raw chats,
credentials, customer data, videos, large traces or repeated logs. Link CI artifacts with run IDs and
retention (current QA reports: 14 days); preserve essential summaries before artifacts expire.

Current feature docs describe what the product does; work items describe why/how a particular change was
made. During Plan mark proposed/planned, Build implemented, Validate verified, Deploy released only after
production verification. Discover/Plan may be abbreviated for small fixes; routine typos need no folder.

Archive whole completed work-item folders under archive/<year>/ after their follow-ups are resolved.
Preserve IDs, internal links, original snapshots and source commits; update the index below. Later this
whole directory can move to an archive repository: record its repository URL and archived commit in the
code repo's index. No tool should depend on a developer's absolute path. Archives are validated for
structure but never considered current gate evidence automatically.

## Index

- [TS-SDLC-001 — five-phase framework](work-items/TS-SDLC-001/requirements.md): implemented; local validation recorded in its evidence ledger; not deployed.

## Release records

Create releases/vX.Y.Z/ from .ai-sdlc/templates/release after freezing the candidate. See the Deploy
workflow for the self-referencing-commit convention, CI/authorization checks and production results.
Historical release status is a report, not proof that the same versions still serve traffic today.

Acceptance criteria, risk, mode and required-evidence fields in work-item.json are part of the source
snapshot. Progress/status and approval bookkeeping are excluded; changing requirement text under the
same AC ID still invalidates prior verification, including for standard-risk work.
