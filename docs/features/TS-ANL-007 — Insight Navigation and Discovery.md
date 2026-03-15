### TS-ANL-007 — Insight Navigation and Discovery

**Objective**  
Expose Merchant Insights and Item Insights clearly in both web and mobile without disrupting current navigation patterns. The current product already has dedicated pages/screens for dashboard, analysis, recurring, and AI chat, so these new insights should follow the same pattern. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
Users should discover the feature naturally without needing to use chat first.

**Requirements**
- Web:
  - add nav entries for Merchant Insights and Item Insights in the authenticated layout,
  - preserve existing `/dashboard`, `/analysis`, `/ai-analyst`, `/expenses`, `/recurring`, `/profile`.
- Mobile:
  - add entries in drawer or a stats sub-navigation,
  - do not remove existing bottom tabs,
  - preserve current screens and drawer items while extending the authenticated experience cleanly.
- Add contextual discovery from:
  - dashboard cards,
  - analysis page drill-downs,
  - AI Analyst suggested prompts.

**Acceptance criteria**
- Users can reach merchant and item insight screens in one or two taps/clicks from the authenticated app shell.
- Existing routes/screens continue to function unchanged.