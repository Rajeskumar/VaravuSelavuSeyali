# TS-GRP-141: Feature Request page container width

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 2.

## Description
`FeatureRequestPage.tsx` uses `Container maxWidth="sm"` (600px) while every other authenticated page
uses `"lg"` (1200px).

## Investigation
Read the full page (`varavu_selavu_ui/src/pages/FeatureRequestPage.tsx`) — it's a simple centered form
(name / email / idea textarea / submit) with no comment, commit message, or design-doc reference
explaining the narrower width. No deliberate reason found. Proceeding with the change per the ticket's
instruction (check first, which is what this investigation is).

Note: `ContactPage.tsx` has the exact same `maxWidth="sm"` pattern and the same lack of justification,
but isn't named in the QA finding — flagged as a candidate follow-up, not changed here to keep this
ticket's diff to the one page actually called out.

## Fix
`FeatureRequestPage.tsx`: `<Container maxWidth="sm" ...>` → `<Container maxWidth="lg" ...>` (or the
`PageContainer` from TS-GRP-140 if that lands first — functionally the same change either way).

## Files touched
- `varavu_selavu_ui/src/pages/FeatureRequestPage.tsx`

## Acceptance criteria
- Feature Request page's content column matches the width of every other authenticated page.
- The form itself doesn't look absurdly stretched — check visually; if the single-column form reads
  poorly at 1200px, cap the form's own inner width instead of fighting the outer container (a `Box`
  wrapper `maxWidth: 600` inside the wider `Container`, so the page frame is consistent while the form
  stays a comfortable width) — this is a judgment call to make while implementing, not before.

## Implementation notes (post-build)

Went with the "cap the form's own width, widen the outer frame" option: `PageContainer maxWidth="lg"`
for the page frame (matching every other authenticated page), with an inner `<Box sx={{ maxWidth: 600,
mx: 'auto' }}>` around the actual form so the multiline textarea and text fields stay a comfortable
~600px regardless of viewport — a full-bleed 1200px textarea would have been worse, not better.

**Verified live**: `.MuiContainer-root` measured `max-width: 1200px` (previously 600px); form content
visually unchanged (still centered, same ~600px reading width). `FeatureRequestPage.test.tsx` passes
unchanged.
