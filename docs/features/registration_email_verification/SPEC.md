# Mandatory email verification at registration — draft spec

Status: **draft, not implemented** (decision D-08, 2026-11-22). Agree the open questions below before building.

## Problem
Accounts can exist with an unverified email. Group features need a verified email (spec R8), so a registered-but-unverified person can't be seated in a group by email; clients fall back to a placeholder seat plus a join link. Verifying at sign-up removes that special case and makes every account's email real.

## Goal
Registration is only complete once the person proves they own the email. Cancelling verification means **no account is created**.

## Proposed flow
1. Person fills the register form (name, email, password) and presses **Register**.
2. Server validates the form, **does not create the user yet**, stores a pending registration (hashed password, hashed code, expiry, attempt counter) and emails a 6-digit code.
3. UI opens a **Verify your email** dialog: code field, Resend (cooldown), Cancel.
4. Correct code → server creates the user as `email_verified = true`, signs them in. Wrong code → inline error (announced), attempts counted.
5. Cancel / dialog dismissed / expiry → pending registration discarded; nothing was created, the email stays free.

## Rules (proposed)
- Code: 6 digits, valid 10 minutes, max 5 wrong attempts then the pending registration is cancelled; Resend allowed after 30 s, max 3 sends per pending registration.
- Rate limits per IP and per email (the existing in-memory limiter is per instance; the pending-registration table gives a durable per-email cap).
- Responses must not reveal whether an email already has an account: an existing address gets the same "we sent a code" response and the email contains a sign-in/reset hint instead of a code.
- Pending registrations are pruned after expiry; the password is stored only as a hash and never logged.
- Existing unverified accounts: keep working; they are asked to verify on next sign-in (separate migration decision).
- Google sign-in already yields a verified email and skips this.

## Surfaces
Web `RegisterPage` and mobile `RegisterScreen` get the same dialog (parity). New endpoints, e.g. `POST /auth/register/start`, `POST /auth/register/verify`, `POST /auth/register/resend`, `DELETE /auth/register/pending`. The current `POST /auth/register` is retired or kept behind a flag during rollout.

## Impact on other features
- Group add-member by email: the "registered but unverified" case disappears for new accounts; the placeholder fallback stays for people with no account.
- QA: `qa/` currently registers real accounts at 5 per hour; it will need a test mail sink or a code-reading hook (never a production bypass).
- Accessibility: dialog is named, focus moves to the code field, errors use `role=alert`, the code field has `autocomplete="one-time-code"` and `inputmode="numeric"`.

## Open questions
1. Allow password-less "magic link" instead of a code, or code only?
2. What happens to existing unverified accounts (force verify, or leave)?
3. Do we need a CAPTCHA/bot check on the start step?
4. Mail delivery failure UX (SMTP down): block registration with a retry message, or queue?
5. Mobile: deep-link the code from the email, or typed code only?

## Test plan (when implemented)
Backend: start/verify/resend happy path, expiry, attempts, resend cooldown, duplicate email (same response), cancel leaves no user, rate limits. Web/mobile: dialog states, cancel, error announcement. QA: E2E with a mail sink; extend `docs/qa/` (UAT-AUTH rows).
