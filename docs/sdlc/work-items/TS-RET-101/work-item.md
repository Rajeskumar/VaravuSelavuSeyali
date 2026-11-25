# Work item — lifecycle and nudge emails from first-party backend data

Status: backlog, not planned. Created 2026-11-25 from the owner's decision that individual-level nudges ("try this feature") must come from the backend's own data, not from GA4/Firebase.

## Problem and outcome
Let the product email people who have not tried or stopped using a feature (for example signed up 7+ days ago with no expense, or no expense in 21 days) using queries over data the backend already holds. Analytics stays aggregate and pseudonymous; no User-ID is sent to GA or Firebase.

## Plan
Needs Discover first: which nudges, frequency caps, a marketing-email opt-in/opt-out and unsubscribe link, privacy-policy wording for product emails, SMTP/provider readiness (SMTP is an owner leftover), and where the job runs (existing Cloud Run job pattern). Expected risk: high (personal data, external side effects, outbound email).

## Tests / Evidence
To be written at Plan.
