# TS-GRP-130 — Payment deep links (Venmo/PayPal/UPI)

**Phase:** 3 · **Spec:** §5.3, §15 (Non-Goals) · **Status:** 📋 Planned

## Scope

**Important boundary:** §15 (Non-Goals v1) explicitly excludes "In-app money movement (Venmo/PayPal/UPI execution) — record-only settlements first." This ticket is *not* that — it's launching the user's own Venmo/PayPal/UPI app with a pre-filled payment request via a deep link, which the user then completes and confirms manually inside that app. TrackSpense never touches money or API credentials for these providers; it only constructs a URL. This is a pure client-side (web + mobile) feature plus one small backend addition (storing payment handles).

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/db/models.py` — add nullable `venmo_handle`, `paypal_handle`, `upi_id` columns to `User` (`models.py:9-19`) via a new Alembic migration. These are the recipient's own payment identifiers, entered once in their profile — **not** something one member sets for another.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — extend whatever the existing profile-update request model is (locate the `/auth/profile` PUT request model before adding fields) with the three optional handle fields.
- `varavu_selavu_app/varavu_selavu_service/api/routes.py` — extend the existing profile update endpoint; no new route needed.
- **New:** `varavu_selavu_ui/src/utils/paymentDeepLinks.ts` — pure functions `venmoLink(handle, amount, note)`, `paypalMeLink(handle, amount)`, `upiLink(vpa, amount, note)`, building the standard deep-link URL formats for each provider (e.g. `venmo://paycharge?txn=pay&recipients=<handle>&amount=<amt>&note=<note>`, `https://paypal.me/<handle>/<amount>`, `upi://pay?pa=<vpa>&am=<amt>&tn=<note>`) with a web-fallback URL for each (Venmo/PayPal have web equivalents when the native app isn't installed; UPI is Android/India-specific and has no meaningful web fallback — omit the button on unsupported platforms rather than showing a dead link).
- `varavu_selavu_ui/src/components/groups/SettleUpDialog.tsx` — when settling with a **registered** counterparty (placeholders have no `User` row, hence no handles) who has a payment handle on file, show provider buttons alongside the existing manual "record cash/other" flow. Clicking a button opens the deep link **and** still requires the user to separately confirm/record the settlement in TrackSpense afterward (no auto-detection of payment completion — that would require provider API integration, explicitly out of scope).
- `varavu_selavu_mobile/src/components/SettleUpSheet.tsx` — same, using `Linking.openURL` (React Native's deep-link API) instead of `window.location`.
- Web/mobile profile settings screens — add the three handle fields to whatever the existing profile-edit form is.

## Acceptance criteria

- A user can save Venmo/PayPal/UPI handles on their profile.
- `SettleUpDialog`/`SettleUpSheet` shows a payment button only for a counterparty who (a) is a registered member with a `User` row, and (b) has that specific handle set; falls back to manual recording otherwise (unchanged Phase 1 behavior).
- Clicking a payment button opens the correct deep link with amount and a note (e.g. "TrackSpense: Apartment 4B settlement") pre-filled; falls back to the provider's web URL if invoked from a browser without the native app (best-effort — most deep-link schemes handle this automatically via OS-level app-link resolution, verify manually rather than assuming).
- No settlement is auto-created by clicking a payment button — the user still explicitly records it via the existing settlement flow afterward. This must be explicit in the UI copy to avoid the user thinking payment == settlement recording.
- UPI button is hidden entirely on web (or shown as a QR code / copyable VPA string instead, since `upi://` links don't resolve in desktop browsers) — decide the exact web UPI treatment during implementation and document it.

## Dependencies

- **TS-GRP-105** (`SettleUpDialog`/`SettleUpSheet` UI these buttons augment).

## Test requirements

- New `varavu_selavu_ui/src/utils/paymentDeepLinks.test.ts`: correct URL construction per provider, amount/note encoding (URL-escape properly — a note containing `&` or spaces must not break the query string).
- `SettleUpDialog`/`SettleUpSheet` tests: button visibility logic (registered + handle-present → shown; placeholder or no-handle → hidden), click opens the expected URL (mock `window.open`/`Linking.openURL`).
