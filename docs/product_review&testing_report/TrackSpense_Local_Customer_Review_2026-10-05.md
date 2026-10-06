# TrackSpense local customer review — 2026-10-05

## Decision

**Do not approve public launch yet.** The tested core accounting flows work, but public legal pages are unfinished, security promises exceed the implementation, and several mutation flows leave conflicting or stale financial information on screen. This is a customer/UX review with targeted source checks, not a complete security penetration test or production certification.

Reviewed `http://localhost:3000` with the local backend at port 8080. Repository HEAD was `bb999a5`, with substantial concurrent uncommitted changes. The application changed during testing. Findings below distinguish observed behavior, source-supported causes, and successful retests. Freeze a release candidate and rerun before sign-off.

## Test account and data

- Account: `launch-review-20261005@example.com`; display name updated to Alex Launch Review QA.
- Signed up through the UI. Email verification redeemed a locally generated verification-token fixture; **real inbox delivery was not tested**.
- Personal expenses: Review lunch $15.00 (edited from $12.50), Coffee at Blue Bottle $6.75, Review subscription $10.00 (recurring Run now).
- Launch Review Trip: Alex and name-only Jamie Review; $60 dinner paid by Alex, split equally. Alex's share $30.00.
- Recorded a $30 cash settlement from Jamie to Alex as synthetic test data. **No money transferred.** Archived and restored this group.
- Overall combined budget $50.00; one $10 monthly recurring template; one catalog card in the synthetic wallet. No real payment credentials entered.
- Final expected personal total $31.75; combined spending $61.75; paid amount $91.75; net balance $0.00.
- Test records remain available for reproducing findings. No product code was changed by this review.

## Open findings

### LR-01 — P1: Published legal pages remain draft templates

**Observed:** `/privacy-policy` and `/terms-of-service` contain “Draft template — review before publishing,” unresolved export instructions, and bracketed pricing instructions. These are linked from the product and signup journey.

**Reproduce:** Open either footer legal link. Inspect privacy export section and terms Fees section.

**Impact:** Customers cannot reliably understand the final terms, data handling, and export process. This is a launch-content blocker, not a legal compliance determination.

**Action:** Have the product owner finalize accurate entity/contact, processing/provider, retention, deletion, export and pricing information; publish reviewed pages without drafting instructions.

**Source:** `varavu_selavu_app/privacy_policy.html:124,228`; `varavu_selavu_app/terms_of_service.html:95,148`.

### LR-02 — P1: Homepage security promises exceed implemented guarantees

**Observed/source-supported:** Homepage says logout signs users out of every device, and no page script or extension can read their sign-in and act as them. Logout revokes the presented refresh token's family, not every independently created user session. HttpOnly protects cookie readability; it does not justify the absolute claim about scripts acting as a user.

**Reproduce:** Read homepage trust cards; compare logout handling with `AuthService.revoke_refresh_token` and `revoke_family`.

**Action:** Describe the actual controls precisely. If global logout is intended, implement and verify revocation across independent sessions, including access-token behavior. Do not present refresh-family revocation as all-device logout.

**Evidence strength:** Static implementation comparison; independent multi-device session test was not run.

**Source:** `varavu_selavu_ui/src/pages/HomePage.tsx` trust cards; `varavu_selavu_app/varavu_selavu_service/auth/routers.py:246`; `auth/service.py:298–315`.

### LR-03 — P2: Successful group changes leave stale and contradictory UI

**Observed:** After creating Launch Review Trip the detail appeared beside “No active groups yet.” After adding Jamie, the detail still showed one member until reload. After recording $30 settlement, the detail showed $0 and settled while the list still said owed $30. Archiving closed the dialog but left edit actions enabled until reload. Restoring succeeded, while the list/dashboard briefly omitted the restored group.

**Expected:** List, detail, member count, actions, dashboard, and balances agree immediately after a successful mutation.

**Reproduce:** Create group → add name-only member → compare count before/after reload. Save a shared expense → settle → compare list and detail. Archive → inspect actions before/after reload.

**Action:** Review all affected query caches and await or optimistically apply mutation results. Settlement success currently invalidates group-balances but not groups. Other symptoms require investigation; do not assume one root cause explains all of them.

**Evidence:** [Conflicting settlement state](local-customer-review-2026-10-05/settlement-zero-confirmation.png). The $0.00 success amount is intentionally the remaining balance; that alone is not incorrect arithmetic.

### LR-04 — P2: Recurring Run now does not refresh combined Transactions

**Reproduce:** With combined Transactions previously loaded at $51.75, create $10 monthly Review subscription → Run now → Transactions. Success toast says logged, but the list still shows $51.75 and omits the charge. Reload shows one new $10 transaction and $61.75.

**Source-supported cause:** `RecurringTab.tsx` invalidates `expenses` and `all-group-expenses`, while combined personal data uses `expenses-full-for-combined`. Review Dashboard/Analysis/Budgets invalidation as well.

**Action:** Refresh all affected views after running or confirming recurring entries. Add a regression that switches from the cached combined list to Run now and back without reload.

**Evidence:** [Stale transaction list](local-customer-review-2026-10-05/recurring-missing-from-transactions.png).

### LR-05 — P2: Export CSV scope does not match the visible list

**Observed/source-supported:** Export CSV is offered while Personal + my shares is selected. `ExpensesPage.handleExport` calls `exportMyExpensesCsv()` without the current scope, month, tag, or search filters. That function exports the personal ledger.

**Impact:** Users reasonably expect the download to match the financial view, but it may omit shared spending and include dates/rows outside the visible selection.

**Action:** Clearly label “Export all personal expenses” and explain limitations, or implement a matching filtered/scope-aware export. Preserve an explicit group-export route if separate exports are intentional.

**Limit:** Browser download capture timed out. No error appeared in the page. This is not evidence that downloads fail for users; actual downloaded file contents were not verified. The scope mismatch is supported by the handler/API code.

### LR-06 — P2: Negative amount is silently changed to positive

**Reproduce:** New expense → enter `-5` in Amount → add description. The field displays `5` and Save expense is enabled. The review canceled without saving.

**Cause:** `utils/amount.ts:sanitizeAmountInput` strips every character except digits and decimal points, including the minus sign.

**Action:** Reject negative input with an explicit message. If refunds are supported, give them an intentional flow. Do not silently change the meaning of pasted/typed financial values.

**Evidence:** [Amount changed to positive](local-customer-review-2026-10-05/negative-amount-becomes-positive.png).

### LR-07 — P2: Terms' Privacy Policy link returns 404

**Reproduce:** Terms links to `/privacy_policy.html`; the supported endpoint is `/privacy-policy`. A direct local HTTP check returned 404 for the former.

**Action:** Fix the href and test every public legal/support link.

**Source:** `varavu_selavu_app/terms_of_service.html:120`; routes in `varavu_selavu_service/main.py:74–87`.

## Findings changed during this review

- **AI period label — retest passed.** Initial September answer was correct ($0) but caption said “This month · My Expenses.” Concurrent changes now use resolved backend metadata. Fresh September question displayed “September 2026 · My spending.” [Before](local-customer-review-2026-10-05/ai-wrong-period-label.png) / [after](local-customer-review-2026-10-05/ai-period-label-retest-passed.png).
- **Card Coach missing assumption disclosure — retest passed for disclosure.** Adding the first card initially labeled historical unassigned expenses as earned rewards without explaining the default-card assumption. Current UI now discloses that $91.75 has no recorded card and is estimated using the default. The $91.75 paid basis includes full group amount correctly. Consider changing “Actual” and “Your cards earned” to estimated wording for assumed amounts; no issuer-rate accuracy validation was performed.
- **Navigation semantics improved concurrently.** Desktop main navigation changed from buttons to links during the review. No claim is made that this resolves all keyboard or screen-reader issues.

## UX assessment

The main mental model is useful: personal spend plus my group share, with a separate paid lens. Quick logging previews the parsed amount and merchant before saving. Empty expense-search feedback is helpful. The 390×844 dashboard and bottom navigation are readable, and the tested Card Coach page had no horizontal overflow (document width 390px).

Improvements beyond functional fixes:

- Explain verification requirements before users fill a group form, with a usable verification action. The server correctly blocked the unverified attempt.
- Label settlement confirmation as “Remaining balance $0.00” and include the amount recorded, so zero is unambiguous.
- In the paid lens, the hero changes while the category breakdown continues showing my-share spend; label these scopes explicitly.
- A group-specific Add Expense initially opened as “Just me,” requiring manual group selection. Source supports a preselected group parameter; retest this after the current changes before treating it as a remaining defect.
- Name-only Jamie is described as pending/hasn't joined even though “Name only” is advertised for someone who will not use the app. Distinguish guest participants from sent/pending invitations.
- People tab empty copy says balances appear after adding a group expense, although this account already has one with a name-only participant and a cleared balance. Explain whether it excludes guests or settled balances.
- Avoid displaying “Select at least one participant” as an error on an untouched default-split settings form.

## Executed coverage

| Area | Result |
|---|---|
| Public landing and legal navigation | Reviewed; LR-01/02/07 |
| Signup and automatic login | Passed with one test account |
| Unverified group gate | Correctly blocked; form retained input |
| Email verification redemption | Passed via local token fixture; delivery untested |
| First expense | $12.50 saved and reflected on dashboard |
| Natural-language quick log | Coffee $6.75 parsed, previewed, saved |
| Edit and tag | Lunch updated to $15; Launch review tag persisted, one expense |
| Search empty state / clear filters | Passed |
| Group create / name-only member | Persisted; stale UI LR-03 |
| Equal shared expense | $60 total, $30 share, $30 receivable correct |
| Settlement record | $30 record cleared net balance; stale list LR-03 |
| Archive and restore | Persisted; archived controls disabled after reload |
| Combined dashboard / Analysis | $51.75 before recurring, $61.75 afterward correct |
| Paid lens | $81.75 before recurring correct |
| Budget creation / overage | $51.75 of $50; $1.75 over correct |
| Recurring template / Run now | Saved, one $10 charge after reload; LR-04 |
| Profile save with blank optional fields | Passed |
| AI current-month total | $61.75 = $31.75 personal + $30 group share correct |
| AI September no-data query | $0 correct; metadata retest passed |
| Card catalog search / add | Passed; assumption disclosure retest passed |
| Mobile-width web navigation/layout | Dashboard, analysis, cards, profile, groups inspected |
| CSV download | Attempted; capture inconclusive; scope issue source-supported |
| Negative amount | Silently converted; LR-06; not saved |

## Required before release approval

1. Finalize legal pages and truthful trust copy; fix known stale financial views and input/export issues.
2. Freeze a release candidate. Rerun these scenarios on that exact build; concurrent source changes prevent a stable-build certification here.
3. Test real mail verification, resend, invite acceptance with a second account, expired/used links, and password recovery. Test multi-user permissions and independent-session logout.
4. Exercise unequal/exact/percentage/shares/item splits, multiple payers, rounding, group expense edits/moves/deletes, partial/over-settlements, comments/history, membership removal, and archive recovery under a second user.
5. Exercise receipt upload, HEIC/image processing, parsing accuracy, item editing/splitting, duplicate handling, and malformed/oversized inputs using controlled fixtures and real photos. No receipt was uploaded in this pass.
6. Verify exported CSV contents, quoting/formula-injection protection, filters, totals and group records. Check item/merchant analytics with a representative historical dataset.
7. Test account deletion and recovery UX, tag bulk actions, budget edit/rollover, recurring pause/idempotence/date boundaries, custom cards/caps, AI creation/refusal/quota states, offline/network failures, and support delivery.
8. Run the existing release checks and cross-browser suite in its documented isolated setup. This pass did not run them against the active server because its auth budget is constrained and mail is configured.
9. Perform keyboard/screen-reader/contrast checks, narrow and wide layouts, real-device performance, and native iOS/Android flows. Phone-width web testing is not native-app testing.
10. Verify production configuration, TLS/cookies, ingress, authorization, rate limits, monitoring, backups/restore and incident handling independently. Local customer testing does not certify these security/operational controls.

## Evidence

Screenshots are stored beside this report in `local-customer-review-2026-10-05/`. Only synthetic account data is present. No passwords or verification tokens are included.
