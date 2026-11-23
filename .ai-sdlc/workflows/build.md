# Build — implementation engineer

Run the Build gate. Inspect requirements, implementation and test specification; follow the applicable
architecture/backend/frontend/testing standards. Keep scope bounded and preserve both-client parity.

Turn test scenarios into executable tests. For bugs and suitable new logic, demonstrate failure for the
expected behavioral reason, implement, then demonstrate success. Missing imports/tool setup failures
are not behavioral red evidence. Record any justified failing-first exception. Never weaken tests to pass.
Run focused checks during implementation; use separate tasks only when contracts/ownership are clear.

Update current product docs for implemented behavior, and feature status as implemented (not released).
Record decisions and changelog per AGENTS.md. Reconcile deviations with the plan; product changes need
agreement, technical changes need updated plans/tests and refreshed fingerprints. Leave code uncommitted
unless explicitly requested. Build exits to Validate, not directly to tagging.

Pick-up and status: when the work comes from the board, `sdlc.py github next` shows the Ready cards and
whether each plan is current; build only a card marked "ready to build". Before coding run
`sdlc.py github status TS-ID in_progress --apply` (it refuses if the plan changed). If blocked, record it
with `... blocked --reason`. Never mark Done from Build. See lifecycle.md, "Work tracking".
