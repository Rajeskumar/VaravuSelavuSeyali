**Status:** 🚧 Partial — updated 2026-07-04 (see [FEATURE_STATUS.md](../FEATURE_STATUS.md))

Confidence classification now exists: `classify_confidence()` in `insight_analytics_service.py` returns high/medium/low based on transaction count (and, for items, distinct-merchant count), exposed as `confidence` on every `InsightMetrics`-based response (list and detail, both the dynamic and pre-calculated read paths). Suppression is wired to it: month-over-month/price-trend fields are hidden when confidence is low, and item store-comparisons require 2+ distinct merchants before showing at all (verified live — a single-store item correctly shows "Not enough data to compare stores" instead of a claim). Merchant-name grouping is canonicalized (trim + lowercase) so near-duplicate casing/whitespace variants merge into one row, while still displaying a real merchant name.

**Remaining gap:** no item/unit-name canonicalization beyond what receipt OCR already provides, and no fuzzy/vector-based entity resolution (e.g. "Coca Cola" vs "Coke") — that's a materially bigger lift, tracked separately in FEATURE_STATUS.md §3.

### TS-ANL-009 — Data Quality and Normalization Guardrails

**Objective**  
Ensure merchant and item insight outputs are trustworthy by introducing normalization guardrails, confidence rules, and safe fallbacks. TrackSpense already uses AI to infer merchants and stores `normalized_name` on expense items, but insight features require stronger trust handling.

**Requirements**
- Define canonicalization rules for:
  - merchant names,
  - item normalized names,
  - optional unit normalization.
- Add confidence classification:
  - high confidence,
  - medium confidence,
  - low confidence.
- Suppress or soften claims when confidence is low:
  - no “cheapest merchant” claim without comparable data,
  - no inflation-style item trend if too few points exist,
  - low-confidence items can still appear in history but marked accordingly.
- Support fallback behavior:
  - if no normalized value, still allow raw historical listing,
  - if merchant is missing, exclude from merchant ranking but keep expense in parent analytics.

**Acceptance criteria**
- Insight APIs expose enough metadata for UI to render confidence-aware states.
- Incorrectly normalized data does not silently produce strong claims.
