### TS-ANL-005 — AI Analyst Upgrade for Item and Merchant Questions

**Objective**  
Upgrade the AI Financial Analyst so that it can answer merchant-specific and item-specific questions using targeted retrieval instead of only injecting broad parent-level analysis context. The current chat flow injects fresh analysis JSON with category totals and monthly trends; this story extends that behavior without removing it. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**User value**  
Users should be able to ask:
- How much did I spend at Walmart this year?
- Where did I buy milk cheapest?
- Which merchant increased my grocery spend?
- Has the price of eggs gone up for me? [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Requirements**
- Keep existing general chat behavior for broad questions.
- Add intent routing:
  - general analysis question → existing `/analysis` context path,
  - merchant question → merchant insight retrieval,
  - item question → item insight retrieval,
  - mixed question → combine scoped data from relevant domains. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Introduce prompt-ready retrieval payloads containing only relevant merchant/item records, not raw full expense history.
- Add suggested prompts to AI Analyst UI mentioning merchant and item use cases.
- When data is insufficient, AI should explicitly say so instead of hallucinating comparisons. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Backend/API**
- Update `POST /api/v1/analysis/chat` contract internally or extend its service behavior so the endpoint can:
  - detect merchant/item intent,
  - fetch relevant merchant/item insight data,
  - inject targeted context,
  - preserve support for current `year`, `month`, `start_date`, `end_date`, and model fields. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)
- Do not break current clients calling chat with general analysis requests. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**UX requirements**
- AI Analyst page/screen placeholder text should mention examples like:
  - “Ask about a merchant, item price, or where you got the best deal.”
- Suggested chip prompts may be added on both web and mobile. Current AI Analyst already exists on both platforms, so this is an enhancement to that existing screen. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)

**Acceptance criteria**
- Merchant-specific and item-specific queries use targeted context instead of full general analysis only.
- General questions continue to work as before.
- AI responses cite lack of data when applicable rather than fabricating certainty. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/11776012/e0df2dd6-a2d1-44b0-b9f1-9622f6140ab8/TrackSpense_Complete_Product_Specification.md)