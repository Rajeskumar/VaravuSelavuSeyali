# SDLC work history

Current product knowledge stays in the existing docs (spec, architecture, feature specs and docs/qa).
This directory holds change history: work-items/<ID>/, releases/<version>/ and archive/. Framework
policy/templates live in .ai-sdlc; executable checks in scripts/quality. Each work item is mirrored to one
issue on the repository's GitHub Project board for queueing, pick-up and status; the board is a view, never a
requirements or gate authority (see .ai-sdlc/lifecycle.md, "Work tracking"). No separate service/database
is required.

## Board commands

Config: `.ai-sdlc/github.json`. Needs `gh` logged in with the `project` scope. Dry run unless `--apply`.

```sh
$SDLC_PYTHON scripts/quality/sdlc.py github sync TS-123 --priority P1 --size M --kind feature   # then --apply
$SDLC_PYTHON scripts/quality/sdlc.py github next                  # Ready cards, best first, plan current?
$SDLC_PYTHON scripts/quality/sdlc.py github status TS-123 in_progress --apply
$SDLC_PYTHON scripts/quality/sdlc.py github status TS-123 in_review --apply
$SDLC_PYTHON scripts/quality/sdlc.py github status TS-123 blocked --reason "..." --apply
$SDLC_PYTHON scripts/quality/sdlc.py github show 34               # a board issue, marked untrusted input
$SDLC_PYTHON scripts/quality/sdlc.py init TS-124 --issue 34       # seed title + link from a hand-made card
```

Board automation you can enable in the project's Workflows screen: *Pull request merged → Done* and *Item
closed → Done* are on. Use `Closes #N` in the PR body so the merge reaches the card.

## Start and resume

After installing scripts/quality/requirements.txt in a venv (see .ai-sdlc/verification.md):

```sh
$SDLC_PYTHON scripts/quality/sdlc.py init TS-123 --title 'Feature outcome' --risk standard --light   # one work-item.md
$SDLC_PYTHON scripts/quality/sdlc.py validate
$SDLC_PYTHON scripts/quality/sdlc.py gate docs/sdlc/work-items/TS-123 --phase plan
$SDLC_PYTHON scripts/quality/sdlc.py plan-fingerprint docs/sdlc/work-items/TS-123
$SDLC_PYTHON scripts/quality/sdlc.py snapshot
$SDLC_PYTHON scripts/quality/sdlc.py gate docs/sdlc/work-items/TS-123 --phase validate
```

The CLI creates a work-item record plus requirement, implementation and test-plan templates (or, with
`--light` for standard/trivial risk, one combined work-item.md) and empty findings/evidence ledgers. The templates are guidance, not approved plans. Replace their content; enter
observable ACs in work-item.json. required_evidence lists expected IDs for checks, reviewers and manual
acceptance verification selected during Plan. Do not reduce that list merely to get a pass.
For high risk, record actual existing user authorization and the plan-fingerprint, never invent approval.
The gate command checks the EXIT evidence of a phase, except Build also checks authorization before code.

Record evidence after execution with: id, passed/failed/skipped status, source snapshot, environment,
command_or_method, source report/CI link, recorded_at (UTC timestamp), and covered AC IDs. Optionally add
`scope` (a list of paths, e.g. a reviewer's routed files) for standard/trivial risk: the snapshot is then
`sdlc.py snapshot --work-item <folder> --scope <files...>` (file contents plus the work item's ACs/risk), and
it stays current while unrelated files change. Scope entries must be files, not directories or globs. High risk always uses the
full snapshot. Validate source evidence and coverage, not just ledger syntax. Use one current entry per evidence ID; preserve
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
- [TS-SDLC-002 — lean framework](work-items/TS-SDLC-002/requirements.md): implemented on `chore/ai-sdlc-optimization`; validation in its evidence ledger; uncommitted.

## Release records

Create releases/vX.Y.Z/ from .ai-sdlc/templates/release after freezing the candidate. See the Deploy
workflow for the self-referencing-commit convention, CI/authorization checks and production results.
Historical release status is a report, not proof that the same versions still serve traffic today.

Acceptance criteria, risk, mode and required-evidence fields in work-item.json are part of the source
snapshot. Progress/status and approval bookkeeping are excluded; changing requirement text under the
same AC ID still invalidates prior verification, including for standard-risk work.
