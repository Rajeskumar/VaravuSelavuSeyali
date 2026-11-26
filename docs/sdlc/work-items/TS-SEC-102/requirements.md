# Work item — Push registration residual and unique device-token index (from TS-SEC-101)

Status: backlog, not planned. Created 2026-11-25 from open findings S-13, S-14 of TS-SEC-101 (`docs/sdlc/work-items/TS-SEC-101/findings.json`), with the owner's approval.

## S-13 (P3): push row of the previous account can outlive a forced sign-out
TS-SEC-101 makes `POST /devices/register` take a push token from any other account that holds it. If the next user on the device never registers push (permission denied), the previous account's row stays until someone registers that token, so that account's group/expense notifications can still reach the device. There is no client unregister on forced sign-out (the token is already invalid). Options to evaluate: have the server drop a user's device rows on logout-all/forced revocation, expire rows by `last_seen_at`, or both.

## S-14 (P3): no unique index on `device_tokens.expo_push_token`
Two concurrent registrations of the same token by different accounts can leave both rows until the next register. Needs an Alembic migration with a dedupe step and a unique index (random hex revision id). **A migration needs the owner's approval, and must be rehearsed against a local DB only.**

## Notes
Expected risk: high (personal data, migration). Not planned; run Discover/Plan first. Urgency: S-13 medium-low, S-14 low; neither blocks a release.

## Plan / Tests / Evidence
To be written at Discover and Plan.
