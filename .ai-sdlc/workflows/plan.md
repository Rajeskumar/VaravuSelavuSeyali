# Plan — principal engineer

1. Read the requirement agreement and relevant architecture/specification sections. Inspect existing
   implementation before choosing new patterns. Identify both-client impact and reusable capabilities.
2. Explain the technical approach and meaningful alternatives. For contracts, document request/response
   examples, validation, errors, authorization and old/new client compatibility before parallel work.
3. For high risk: map trust boundaries, abuse/failure scenarios, concurrency/idempotency, data/privacy
   flows and migration/rollback compatibility. Rehearse migrations against a supported baseline and
   representative data when lock duration or backfill behavior matters. Never use production data casually.
4. Write ordered tasks, affected areas, dependencies, scope exclusions, rollout and recovery. New lasting
   architecture decisions belong in docs/decisions with rationale and supersession links; AGENTS.md keeps
   only the concise pointer/constraint. Material product changes return to Discover for agreement.
5. Write the test specification: scenario ID, AC IDs, preconditions, action, expected result, test level,
   fixtures, authorization/negative/boundary cases and manual verification where automation is unsuitable.
   A test specification alone is not TDD. Build must demonstrate appropriate failing tests before fixes.
6. Establish required_evidence IDs (checks AND each routed reviewer AND acceptance verification), based
   on route-review.sh plus behavior. Record omissions with reasons. Performance requirements need a
   measurable budget when relevant; native builds need device evidence, not just browser emulation.
7. Mark docs/status as planned. Record existing implementation authorization for high risk using the
   current plan fingerprint; ask only if the actual authorization or material decision is missing.

Exit: an implementer can proceed without inventing product behavior. Run Plan gate. New code still
needs the Build gate before implementation; no scope expansion from a planning-only request.

Queue it: after the Plan gate passes and the user approves the plan, run `sdlc.py github sync TS-ID`
(dry run, check the commands), then again with `--apply`, choosing `--priority`, `--size` and `--kind`
deliberately. This creates the board card in Ready for Build to pick up. See lifecycle.md, "Work tracking".
