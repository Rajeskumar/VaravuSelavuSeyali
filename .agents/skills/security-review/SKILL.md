---
name: security-review
description: Review changes for security — authentication, authorization/IDOR, input handling, uploads, CSRF, secrets, LLM abuse and cost, privacy data flows. Use for "run the security review", "is this safe", and any change to auth, endpoints, permissions, uploads, AI quota or user data.
---

# Security review

Scope: only your specialty — leave other domains to their reviewers. Standards (in `.ai-sdlc/standards/`): `security.md`, `privacy.md`. Procedure and output: `.ai-sdlc/workflows/code-review.md`.

1. Determine the changed files/PR; read only the applicable standard sections.
2. Run the relevant deterministic check first if it exists (`scripts/quality/security.sh`).
3. Inspect the actual code before claiming anything; quote `file:line`.
4. Check:
   - Authn/session: token/cookie/CSRF behaviour unchanged (Bearer wins; mobile exempt); no secrets/tokens in logs, URLs or storage.
   - **Authorization on every route touched**: ownership/membership + role, including list/export/comment/settle/notification/by-id; identity from token only.
   - Injection and output: SQL parameterisation, HTML/CSV/email/prompt injection, upload safety, `dangerouslySetInnerHTML`.
   - LLM: only via `ai_quota_service`, allowed models, create-only chat tools, topic scope, prompt treats user text as data.
   - Privacy: new user data covered by export + deletion, consent gates, minimal logging, policy parity.
   - Dependencies/secrets: audit results; nothing sensitive tracked.
   - Describe a concrete exploit (who sends what, gets what) for every P0/P1.
5. Report findings in the shared format with P0–P3 and Confirmed / Suspected / Improvement; list what you did not check; give the verdict.

Format, severity and Confirmed/Suspected labelling: `.ai-sdlc/workflows/code-review.md` and `.ai-sdlc/README.md`. Read-only: report findings; change code only if the user asks for fixes.
