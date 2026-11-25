# Definition of Done

Tick what applies; write "n/a — reason" for the rest. Trivial changes (typos, comments, copy) need only the first block.

**Always:** builds/typechecks/lints; relevant tests pass; diff self-reviewed; no debug code or secrets; `CHANGELOG.md` line for meaningful changes.

**Functional:** acceptance criteria met incl. edge cases; business rules match the spec; flags honoured server- and client-side; web↔mobile parity addressed. A new critical mobile journey or native-only behaviour has a `qa/mobile` flow (with `testID`s; financial writes verified on the server), or the plan records why not.
**UX:** desktop + phone widths (390/320); light + dark; loading, empty, error, success states; destructive actions confirmed; copy is specific.
**Validation & errors:** input validated client and server; errors are actionable and announced.
**Authorization & privacy:** ownership/membership + role checked; unauthorised and forbidden tested; new user data covered by export + deletion; consent respected.
**Accessibility:** one h1, names, labels, keyboard, focus, dialog semantics, contrast, live regions (standards/accessibility.md).
**Tests:** unit; API (success/validation/401/403); UI (RTL); E2E only for critical journeys; failing-first test for bugs.
**Performance:** bounded queries/lists, no N+1, indexes for new filters, heavy UI lazy.
**Security:** no new injection/IDOR/secret exposure; LLM calls metered via `ai_quota_service`.
**Observability:** failures logged with ids, no PII.
**Docs:** `README.md` updated if product scope or setup changed; `docs/TrackSpense_Complete_Product_Specification.md` updated if business rules, schemas, endpoints, or user-facing behaviour changed; `docs/FEATURE_STATUS.md` updated for added/completed features; `docs/features/` spec added or updated for non-trivial features; `docs/ARCHITECTURE.md` updated for new services/layers/integrations; AGENTS.md Key Decision for new patterns.

**Lifecycle:** relevant work-item artifacts current; ACs traced to verification; required evidence matches
the final source snapshot; findings resolved or explicitly accepted under lifecycle.md. Validated is not
deployed. Production release also requires the Deploy checklist and observed production results.
