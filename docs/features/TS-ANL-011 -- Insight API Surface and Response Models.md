### TS-ANL-011 — Insight API Surface and Response Models

**Objective**  
Create the formal API contract for merchant and item insights in a way that is consistent with current authenticated `/api/v1/*` routes, current error model, and current request/response design style.

**Requirements**
- Add new authenticated endpoints:
  - `GET /api/v1/analytics/merchants`
  - `GET /api/v1/analytics/merchants/{merchant_name}`
  - `GET /api/v1/analytics/items`
  - `GET /api/v1/analytics/items/{item_name}`
- Maintain current API conventions:
  - bearer auth,
  - user scope derived from JWT,
  - common HTTP error codes,
  - existing JSON response structure patterns.
- Add typed API models for summary and detail contracts.
- Update frontend/mobile API layers:
  - web `src/api`,
  - mobile `src/api`,
  - shared model typings where appropriate.

**Acceptance criteria**
- APIs are documented in the same style as the existing spec.
- Web and mobile clients can consume the new endpoints without changing existing analysis calls.