# Release record

Candidate, authorization, checks and component status: release.json.

## Scope and evidence
Link work items, current CI runs, reviews and accepted non-blocking risks. Record manual UAT limits.

## Rollout and recovery
Previous component images; schema compatibility; flags/configuration; rollback or roll-forward procedure.
Explicit authorization source and scope. Never put secrets in this record.

## Execution and production verification
Backend/frontend build URLs, migration result, serving revisions/images, smoke results, error-signal
observation window and limitations. Record partial deployment/failure explicitly.

## Follow-up
Owner and work-item links for unresolved issues. A successful build alone is not a verified release.
