# Product standard — TrackSpense

TrackSpense is a **reconciliation instrument** (docs/design/TrackSpense_UX_Design_Spec.md §0): one trustworthy number for "what did I actually spend — mine plus my share of everyone's". Personal expenses + group splits + AI help, on web and mobile.

## Principles reviewers check against
- **Money is trusted before it is pretty.** Amounts are `Decimal`, totals reconcile everywhere they appear, nothing silently changes a user's number. A wrong amount is P0.
- **One true number, many lenses.** Add a lens or filter, not another competing total.
- **AI assists, never silently mutates.** Chat may create expenses; it never updates or deletes them. Off-topic is refused. Every LLM call is metered.
- **Privacy by default.** No card numbers; analytics only after consent; the user can export and delete their data.
- **Web ↔ mobile parity.** A feature in one client has a stated plan for the other, or a documented reason it is web/mobile only.
- **Flag-gated surfaces** (`GROUPS_ENABLED`, `BUDGETS_ENABLED`, `CARD_COACH_ENABLED`, `TAGS_ENABLED`, `ENTITY_RESOLUTION_ENABLED`, `AI_ENABLED`) must be hidden in both clients *and* rejected by the API when off.

## Acceptance criteria
Write them as observable outcomes ("a group member who is not the payer sees X after settling"), including the empty, error and permission cases. Business rules live in `docs/TrackSpense_Complete_Product_Specification.md`; status in `docs/FEATURE_STATUS.md`; specs in `docs/features/`; tickets are `TS-<AREA>-<n>`.

## Product review questions
Does it meet the stated acceptance criteria and the spec's business rules? Is any rule contradicted elsewhere in the app (two screens, two numbers)? Is the unhappy path designed? Is anything user-visible missing a doc/changelog/spec update? Is it scope creep?
