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
