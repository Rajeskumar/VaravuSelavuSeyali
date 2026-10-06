# Privacy standard

TrackSpense stores spending, merchants, receipt text, group membership, emails/names (and optional phone and payment handles).

- **Minimise:** no card numbers (Card Coach tracks card *types* only); collect only what the feature needs; optional fields stay optional.
- **Consent:** analytics (GA4) loads only after consent (`utils/analyticsConsent.ts`, `ConsentBanner`); AI use has its own consent (`utils/aiConsent.ts`). New third-party scripts/SDKs need the same gate.
- **Group visibility:** members see what the group model says they see (shares, activity) — not other members' personal expenses or non-group data. Per-person "owes you" figures derive from `transfers`, never another member's group-wide net.
- **LLM/OCR data flow:** receipt text and expense context sent to a provider is the minimum needed, goes through quota/gating, and is never logged. Mobile OCR stays on-device where possible.
- **User rights:** data export (`account_export_service`) and account deletion (`test_account_deletion.py`) must cover every new table/column that holds user data — adding user data without updating both is a P1.
- **Retention/logging:** no PII in logs or error trackers; invite/notification payloads carry no more than needed.
- **Policy parity:** `privacy_policy.html` / `terms_of_service.html` change when data collected or processors change.
