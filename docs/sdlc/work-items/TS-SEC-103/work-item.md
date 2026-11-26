# Work item — Sign-out and token-refresh robustness (from TS-SEC-101)

Status: backlog, not planned. Created 2026-11-25 from open findings S-4, S-6, S-16 and the draft-autosave part of S-8 of TS-SEC-101 (`docs/sdlc/work-items/TS-SEC-101/findings.json`), with the owner's approval.

## S-4 (P3): sign-out can fail after the session was already ended
`signOut` advances the session first; an unwrapped SecureStore delete failure rejects it, leaving the user signed in, with guarded actions silently dropped. `authApi.logout` also has no timeout and ignores a non-2xx response (pre-existing).

## S-6 (P3): refresh single-flight is not session-aware (pre-existing)
User B can join user A's in-flight refresh (which resolves null) and be force-signed-out right after login; a refresh racing a password change can do the same. Suggested: retry once when the stored refresh token changed.

## S-16 (P3): AI consent edge cases
The consent check and the network call are not atomic across a concurrent account switch (milliseconds); `signIn` writes `user_email` last; two dialogs can stack if B asks while A's prompt is open; the declined message is misleading if the owner read fails; no owner cache.

## S-8 remainder (P3): expense-draft autosave is not session-guarded
It can write a draft in the window between sign-out starting and unmount (owner-tagged, so another owner's read rejects it, but it sits in SecureStore until read or the 1-hour TTL).

## Notes
Not planned; urgency low, none blocks a release. Web/mobile parity applies where the web client has the same flow.

## Plan / Tests / Evidence
To be written at Discover and Plan.
