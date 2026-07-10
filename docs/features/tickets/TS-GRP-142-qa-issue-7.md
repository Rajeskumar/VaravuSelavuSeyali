# TS-GRP-142: Pluralization on count labels

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 3.

## Description
Confirmed: "1 purchases" (Item Insights), "1 visits" (Merchant Insights). The ticket asked to search
for the same pattern elsewhere rather than only patching the two confirmed spots.

## Investigation
The codebase already has an established correct idiom used in several places (`FriendBalancesWidget.tsx`,
`GroupCard.tsx`, `TrueTotalHero.tsx`, `GroupDetailPage.tsx`):
```
{count} noun{count === 1 ? '' : 's'}
```
Searched both apps for count-driven labels that *don't* follow it. Found six more instances beyond the
two confirmed:

**Web (`varavu_selavu_ui`):**
- `pages/ItemInsightsPage.tsx:274` — `{row.transaction_count ?? 0} purchases`
- `pages/MerchantInsightsPage.tsx:238` — `{item.purchase_count} purchases`
- `pages/MerchantInsightsPage.tsx:328` — `{row.transaction_count ?? 0} visits`
- `components/expenses/RecurringPrompt.tsx:97` — `{due.length} recurring expenses are due` (always
  plural — also always says "are due" rather than "is due"). Worth noting: this component **is** the
  login auto-prompt confirm flow investigated separately in TS-GRP-147.

**Mobile (`varavu_selavu_mobile`):**
- `screens/MerchantInsightsScreen.tsx:169` — `{selectedMerchant.transaction_count} transactions`
- `screens/MerchantInsightsScreen.tsx:216` — `{y.transaction_count} transactions`
- `screens/MerchantInsightsScreen.tsx:390` — `{m.transaction_count} transactions`
- `screens/ItemInsightsScreen.tsx:358` — `{summary.mostFrequent?.transaction_count ?? 0} purchases`

Checked mobile's `RecurringPrompt.tsx` (the equivalent login-prompt component) for the same "are due"
bug — it uses a static, count-independent heading ("Recurring Expenses Due") and subtitle, so there's
no singular/plural bug there; left untouched.

Also checked `HomeScreen.tsx`/`ExpenseCard.tsx` (mobile) for other count-noun patterns — found lowercase
`my expense` used as an inline per-row descriptor (e.g. "GroupName · my expense"), which is a different,
grammatically-correct usage (a sentence fragment, not a pluralized count) — not a match for this bug
class, left alone.

## Fix
Apply the existing `{count} noun{count === 1 ? '' : 's'}` idiom to all eight spots above. For
`RecurringPrompt.tsx`, also fix the always-plural verb: `{due.length === 1 ? 'expense is' : 'expenses
are'} due`.

## Files touched
- `varavu_selavu_ui/src/pages/ItemInsightsPage.tsx`
- `varavu_selavu_ui/src/pages/MerchantInsightsPage.tsx`
- `varavu_selavu_ui/src/components/expenses/RecurringPrompt.tsx`
- `varavu_selavu_mobile/src/screens/MerchantInsightsScreen.tsx`
- `varavu_selavu_mobile/src/screens/ItemInsightsScreen.tsx`

## Acceptance criteria
- All eight spots read correctly at count = 1 and count > 1.
- No other unpluralized count-noun pattern found in a follow-up grep after the fix.

## Implementation notes (post-build)

All eight spots fixed with the existing `{count} noun{count === 1 ? '' : 's'}` idiom;
`RecurringPrompt.tsx` additionally got `{due.length === 1 ? ' is' : 's are'} due` to fix the verb
agreement, not just the noun.

**Verified live**: created a recurring template and let it backfill 7 occurrences — the login
auto-prompt drawer correctly read "7 recurring expenses are due" (plural, since 7 ≠ 1). A follow-up
repo-wide grep for the bare `purchases`/`visits` pattern (excluding the now-fixed conditional forms)
came back empty on both apps. `npx tsc --noEmit` clean on both; full web (46) and mobile (39) Jest
suites pass, including the existing `MerchantInsightsPage.test.tsx` assertion for `'5 visits'` (5 ≠ 1,
so the fixed logic still produces the same string).
