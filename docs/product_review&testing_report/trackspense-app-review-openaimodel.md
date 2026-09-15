# TrackSpense: functional, UI and UX review

Reviewed September 14, 2026 · Live app: https://expense.cerebroos.com/

## Assessment

TrackSpense has a compelling product idea: combine personal spending and a person's share of group expenses, then make the result easy to understand and settle. The tested ledger arithmetic supports that promise. Manual entry, natural-language personal entry, direct group entry, scope filters, and dashboard totals worked in the scenarios exercised.

The experience is not yet consistently dependable. Expense notes fail to reappear after saving, placeholder member creation fails, moving an existing expense to a group fails, and the natural-language preview can classify an explicitly named group expense as personal. These deserve priority over adding more features. Visually, the translucent dialogs and unreadable user-message bubbles undermine otherwise coherent branding.

This is an interactive product evaluation, not a security audit or an exhaustive certification. Findings below distinguish observed failures, design judgments, and unverified paths.

## Coverage and results

| Flow | What I exercised | Result and critique |
|---|---|---|
| Landing page | Positioning, feature explanations, CTAs, privacy copy, cookie choice | Clear combined-ledger proposition. The technical security copy is too detailed for the main marketing journey. |
| Login | Existing Google account sign-in | Successful. An initial embedded-button automation limitation was overcome using keyboard navigation; that limitation is not an app defect. |
| Registration | Form inspection only | Name, email, optional phone, password and Google option available. Password visibility control was not apparent; the optional phone field lacks a clear benefit explanation. |
| Recovery | Forgot-password screen | Clear email-entry flow and Back to Login. No reset message sent and no password changed. |
| Dashboard | Empty state, populated state, group share inclusion | Totals reconciled. Initial empty state promoted a budget without a contextual first-expense action in the empty transaction area. |
| Manual expense | Created $84.20 dinner with Dining out category | Saved correctly and updated totals. Required-field expectations and currency could be clearer before saving. |
| Expense cancellation | Filled amount, description and category; closed and reopened | Draft was lost without warning or recovery. |
| Expense editing | Saved notes and reopened, then repeated | Notes returned blank after both attempts. |
| Quick personal entry | Entered a $6.75 purchase at UX Test Cafe | Preview recognized amount, merchant and category; expense persisted. Dashboard and expense list use different title representations for this record. |
| Quick group entry | Typed an expense explicitly naming the existing UX Audit Test group | Preview displayed Split Personal. I did not submit the mismatched preview. |
| Expense scopes | Personal, Groups and Combined | Correct totals: $90.95 personal, $20.00 group share, $110.95 combined. |
| Tags | Created UX Audit, attached it to dinner, saved and filtered | Attachment persisted. Filter initially said No options; after refresh, the tag appeared and returned the $84.20 expense. |
| CSV export | Invoked Export CSV | Exporting state appeared and then cleared. Download contents and correctness were not inspected. |
| Recurring | Created a $10/month synthetic template with status Paused | Saved successfully; active count remained zero and active monthly total remained $0.00. Actual scheduled generation was not tested. |
| Group creation | Created UX Audit Test | Successful. Group layout truncates its short name in the main header at the tested desktop size. |
| Adding members | Tried Placeholder name → UX Test Alex → Add | Failed with a generic error. No invitation sent. |
| Direct group expense | Saved a $20 household-supplies expense | Successful; the $20 personal share joined the combined dashboard total. |
| Split editor | Inspected five modes; tested invalid Exact allocation | Correctly rejected a $10 allocation for a $20 expense and disabled Save. Multiple-person rounding remains unverified. |
| Move to group | Tried moving the $84.20 personal dinner to the test group | Failed. Original personal expense remained present. |
| Group activity | Inspected history after saving | Group creation and expense addition appeared in activity. |
| Balances / People | Viewed single-member balances and People empty state | Zero balances and disabled settlement were appropriate for the test data. Multi-person settlement could not be evaluated. |
| Analysis | Overview, Items and Merchants | Initial $84.20 total matched the ledger. Description-only input appeared as a merchant and an item, creating misleading specificity. |
| Budgets | Inspected overall/category, scope, threshold and rollover controls | Useful depth. Configuration sits under Analysis and introduces more complexity than the initial dashboard explains. No budget saved. |
| Cards | Inspected catalog and custom-card form | Catalog and custom rewards-rate entry available. Feature purpose and placement need clearer introduction. No card added. |
| AI analyst | Asked for initial monthly total, then combined total including group shares | Correct $84.20 initial answer and $110.95 combined answer. For the combined query, it identified the $20 group share but said it could not list individual group expenses. Its scope label still read This month · My Expenses. User question was visually unreadable in its light message bubble. |
| Profile | Inspected identity, payment handles, tags and account deletion controls | Utility features are mixed with destructive controls; Tags appears after the Danger Zone. No identity/payment settings changed. |
| Help | Opened Contact Us | Contact form available, but normal sidebar navigation disappears; no message sent. |
| Receipt scanning | Exercised Scan receipt entry point | No file uploaded; extraction quality and correction flow remain unverified. |
| Mobile and light mode | Attempted narrow viewport; inspected available theme control | Narrow viewport did not take effect in the browser tool. Actual rendered viewport stayed 1280×720. Mobile and light-mode behavior are not rated. |

## Functional issues to fix first

### F1 — Saved notes are not restored · High

**Reproduce:** Expenses → open UX audit test — dinner → enter Notes → Save changes → reopen the expense. I repeated this using “UX audit note persistence test.” The field returned empty after saving.

**Impact:** Users cannot trust that contextual information survives an edit. This finding concerns the observable save-and-reopen behavior; it does not establish whether the storage or retrieval layer is responsible.

**Fix:** Make the edit round trip preserve notes and show an explicit success or failure result. Acceptance check: save, close, reopen, refresh and reopen again; the note must remain identical.

### F2 — Placeholder member addition fails · High

**Reproduce:** UX Audit Test → Add Member → Placeholder name → enter UX Test Alex → Add. The dialog displayed “Failed to add member”; group membership remained at one.

**Impact:** A route intended for people without an account blocks group onboarding and prevents evaluating the app's central shared-spending use case.

**Fix:** Restore placeholder creation and give actionable failure explanations. Verify that placeholders become selectable as both participants and payers without sending invitations.

### F3 — Moving an existing expense to a group fails · High

**Reproduce:** Open the $84.20 dinner → Move to group… → choose UX Audit Test → Move. The dialog returned “Failed to move expense to group.”

**Impact:** Users cannot correct an expense entered in the wrong scope. Direct group expense creation did work, so this failure is specific to the transfer path in the tested scenario.

**Fix:** Make transfer atomic and preserve category, tags and notes. Show payer, participant allocation and personal-total effect before committing. Verify no duplicate is left behind and totals remain consistent.

### F4 — Explicit group instruction previews as personal · High

**Reproduce:** In the header input, type “UX audit group test 20 at UX Test Store split with UX Audit Test.” The preview displayed amount US$20.00, merchant UX Test Store, category General, and Split Personal despite the existing named group.

**Impact:** A user who trusts the natural-language promise may save to the wrong ledger. Only the preview mismatch was established; I did not submit it.

**Fix:** If group resolution fails, ask the user to choose a group. Do not silently default to personal when the input explicitly requests a split. Test group names containing spaces.

### F5 — New tags are unavailable until refresh · Medium

**Reproduce:** Create UX Audit in the expense editor, select it, save, then search for it in Filter by tag. No options appeared. After refreshing, UX Audit became available and correctly filtered the dinner expense.

**Fix:** Refresh the available-tag list immediately after creation. Keep the expense list and tag picker synchronized.

### F6 — Expense descriptions masquerade as merchants · Medium

The dinner was entered as a description with the optional merchant left blank. Its detail view labelled that value Merchant, and Analysis described it as a new merchant. Items also treated it as a purchase item. The interfaces blur description, merchant and receipt item.

**Fix:** Preserve these as separate concepts. Use “Merchant not provided” when appropriate. Label any fallback grouping explicitly instead of reporting a known merchant or item that the user never supplied.

## UI critique

### AI evidence limitation

When explicitly asked to list the expenses behind the combined $110.95 total, the AI listed the two personal expenses and the $20 group-share total, but said it could not list individual group expenses. The group ledger contained one identifiable $20 entry. This is a traceability gap rather than an incorrect total. Give the analyst access to the same user-authorized group detail used by the ledger, and make the scope badge explicitly say that group shares are included.

### U1 — Translucent dialogs impair readability · High

In New expense, confirmation and Group Settings, background text, cards and charts remain visible through the foreground surface. In the group expense form, the group name visibly competes with the amount field. On confirmation, the dashboard chart runs behind the success content.

Use an opaque or nearly opaque dialog surface and a consistent dimmed backdrop. Keep the gradient treatment for accents and larger decorative areas. Check dialogs against dense pages, not only empty states.

### U2 — AI user-message text is not readable · High

The submitted question was present in the accessible page text, but its light-colored bubble looked almost blank in the dark theme. The assistant response below was readable.

Define paired text and background colors for every message role and theme. Visually verify actual questions, links and multiline messages. The screenshot supports a readability defect; no formal contrast-ratio audit was performed.

### U3 — Group workspace allocates width poorly · Medium

At 1280×720, global navigation, group list, expense area and balances sidebar compete for width. “UX Audit Test” truncates in the main group header while substantial space remains unused elsewhere.

Let group navigation collapse, preserve the complete group name, and prioritize the expense workspace. Consider opening balance detail on demand where space is limited.

### U4 — Component and terminology inconsistencies · Medium

The same activity is labelled New expense / Add Expense; recurrence creation is Add Template / Save Template; currency varies between $ and US$. Disabled gradient buttons still look visually prominent. Some section headings use very small semantic heading levels.

Standardize action names, disabled styling, currency presentation and heading structure. Use “Recurring expense” in the user-facing flow. The header command field is narrow and truncates its useful example despite available space.

## UX critique

1. **Make the first successful expense the onboarding milestone.** Provide a clear first-expense action, then introduce group membership and budgets at the relevant moment. The blank dashboard's strongest contextual prompt is currently about budgeting.

2. **Protect unfinished work.** Preserve expense drafts or ask before discarding a changed form. A close action currently erases amount, description and category silently.

3. **Make scope explicit everywhere.** Personal, My expenses, I paid, Combined and Include group shares are meaningful distinctions but need concise definitions. Preserve explicit dates in AI scope summaries rather than replacing a named month with “This month.”

4. **Explain recurring behavior.** The form exposes a day of month and monthly cost without frequency alternatives. State when an entry will be generated, what happens on the 29th–31st in shorter months, and whether entries are automatic. A paused template still says “Charges on the 14th,” which can sound like actual payment collection. Prefer “Would log on the 14th; currently paused.”

5. **Separate recording a settlement from paying.** The marketing promises “one payment” and “settle in one tap,” while profile settings expose payment-service handles. Clearly distinguish opening a payment app, recording an external payment, and confirming an actual transfer. Settlement execution itself was not tested.

6. **Organize around user tasks.** Budgets and Cards sit inside Analysis; People sits inside Groups; Tags sits in Profile after account deletion. Group related setup functions coherently and keep dangerous actions last. Explain what the Cards feature calculates before showing a rewards catalog.

7. **Keep recovery paths available.** Contact Us drops the app sidebar. Include Back to app and retain a navigable app identity. Provide specific error messages with useful next actions for failed member additions and transfers.

8. **Simplify trust copy.** The landing page's cookie/token/CSRF terminology is more suitable for a detailed security page. Lead with plain explanations of data use, export and deletion; ensure technical claims are independently substantiated. This review did not verify security implementation.

9. **Reduce empty-state duplication.** The initial Groups screen simultaneously showed No active groups yet and No groups yet, with three group-creation entry points. Use one clear message and one contextual action.

10. **Strengthen keyboard and assistive-technology support.** A skip link and several named controls are present, which is positive. Review the form labels, category/group chips, chart interactions and heading hierarchy with keyboard and screen-reader testing. The current inspection is insufficient to claim accessibility conformance.

## Recommended order of work

**First:** Fix notes restoration, member creation, expense transfer, explicit-group parsing, dialog readability and AI-message colors. These affect trust in core actions.

**Next:** Fix tag-picker refresh, preserve drafts, separate description/merchant/item meanings, improve error recovery, clarify scope and currency, and rebalance the group layout.

**Then:** Refine onboarding, recurring language, navigation, empty states and accessibility. Complete a separate mobile and populated multi-user regression pass before judging release readiness.

## Remaining verification

Multiple-person equal splits, penny rounding, percentages/shares/adjustments, multiple payers, cross-group netting, partial settlements, payment links, receipt OCR and correction, scheduled recurring generation, budget alerts, card calculations, CSV contents, email delivery, deletion recovery and security were not verified end to end. The member-addition failure blocks several of these flows. Mobile could not be validated because the browser viewport override did not take effect.

## Test data left in the account

| Record | State |
|---|---|
| UX audit test — dinner | Personal expense, $84.20, Dining out, UX Audit tag attached |
| UX Test Cafe | Personal expense, $6.75; dashboard title shown as UX at UX Test Cafe |
| UX Audit Test | Group with the signed-in account as its sole member |
| UX audit test — group supplies | Group expense, $20.00, Household supplies; personal share $20.00 |
| UX audit test — inactive subscription | Paused recurring template, $10.00/month, Music; excluded from active monthly total |
| UX Audit | Tag created and attached to dinner |

Final verified spending: **$110.95 combined = $90.95 personal + $20.00 group share**. No real payments, invitations, support messages, account deletion or password changes were performed. No receipt or personal file was uploaded. Test records remain available for inspection.
