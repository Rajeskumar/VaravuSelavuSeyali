# Bug fix — condensed lifecycle

Discover: reproduce, expected/actual result and affected users; if reproduction fails, record attempts.
Plan: identify root cause, sibling/client impact, risk, minimal fix and regression test. High risk still
needs the current implementation authorization and safeguards; urgency is emergency mode, not low risk.
Build: demonstrate a meaningful failing test where feasible, fix minimally, run focused checks.
Validate: route reviews, verify the regression and related behavior, record evidence and docs/changelog.
Deploy: only if requested, through the normal candidate gate. An implemented fix is not necessarily live.
Use lifecycle.md and the phase workflows for gates, records, repair limits and authorization boundaries.
