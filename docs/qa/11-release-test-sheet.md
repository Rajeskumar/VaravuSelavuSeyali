# 11 — Release Test Sheet

The final test before a production release (TS-QA-104). Copy this file to `docs/sdlc/releases/v<version>/test-sheet.md` and fill in the copy. `08` remains the full release checklist; coverage detail is in `10`.

**Release:** ____ · **Commit:** ____ · **Date:** ____ · **Tester:** ____ · **Changed since last release:** web ☐ API ☐ mobile ☐

## Rules
- Test the **exact commit** being released. A later change means re-running the affected parts.
- Result is **Pass**, **Fail**, **Blocked** or **N/A** (with a reason). Blank means not run, never passed.
- Any failed or unrun **P0** step means no release. A P1 failure needs a written waiver (owner, reason, due date).
- Use synthetic test accounts on a local or isolated test backend. **Never create, change or delete data in production**; production checks are read-only (Part D).
- Record evidence for every Fail (screenshot, steps, expected and actual), then re-run that step and its section after the fix.
- This sheet is not yet enforced by release tooling.

## Part A — Automated (run first; stop on failure)

| ID | Check | How | Result / evidence |
|---|---|---|---|
| A1 | Unit, API, security, framework checks on the commit | `unit.yml`, `framework.yml` green | |
| A2 | Web smoke, regression, API, account, accessibility, cross-browser | `qa.yml` green on the commit (the cross-browser step runs outside pull requests) | |
| A3 | Release check and Postgres tests | `make release-check`; `varavu_selavu_app/run_e2e_pg_tests.sh` | |
| A4 | Native E2E, iOS **and** Android: when mobile code or an API it uses changed | `make mobile-e2e-build-ios && make mobile-e2e-ios SUITE=regression`, then the `android` pair | |
| A5 | No retried or newly skipped test hidden in A1–A4 | read the reports | |

## Part B — Your manual smoke test (every release)

Judge two things at each step: the expected result, and whether anything looks wrong (layout, wording, slowness, odd numbers). Targets: web about 15 minutes, each phone about 10. They are estimates until the first run.

**Owner decision (2026-11-26):** run the manual smoke test every release. This sheet assumes all of web, iOS and Android.

**Test data:** two accounts, **A** and **B**, both verified. Note A's Dashboard total before you start (call it T).

### Web (desktop browser; W12 also at phone width)

| ID | Pri | Do | Expect | Result |
|---|---|---|---|---|
| W1 | P0 | Open the site signed out; sign in as A; reload | Home page renders; Dashboard loads; still signed in after reload | |
| W2 | P0 | Add `20.00` with New expense (set merchant and a tag); add `5.50` with the header type-to-log bar | Each saved once, with a sensible category; future date cannot be picked | |
| W3 | P0 | Dashboard | Total is T + 25.50; switching scope and opening each card or link works | |
| W4 | P0 | Expenses: search, filter by month and tag; change `20.00` to `21.00`; delete `5.50` (cancel once first) | Filters correct; Dashboard total now T + 21.00 | |
| W5 | P0 | Create a group; add B and a name-only member. Add `30.00` split equally in the group; one `10.00` unequal split; one from Quick Capture using "Who was this with?"; move one personal expense into the group | Shares add up to each total to the cent; balances match your own arithmetic; nothing appears twice. For the moved expense, only your share counts in your totals | |
| W6 | P0 | Edit one group expense's description only; add a comment; delete another group expense | The split is unchanged by the edit; balances and history update | |
| W7 | P0 | Settle part of a balance, then the rest; record one custom settlement | Balance shows what is still owed, then settled up; the custom payment moves both balances. (The app has no way to undo a settlement.) | |
| W8 | P1 | Group settings (toggle simplify debts, export CSV, archive and restore); People and Activity tabs | Each works; export matches the group | |
| W9 | P1 | Expenses → Recurring: add a template, Run now twice, delete it | One expense only; second run warns | |
| W10 | P1 | Analysis: Overview (month, year, include group shares), Items, Merchants, Budgets (create, delete), Cards (add, remove) | Overview total matches Dashboard for the same month and scope; nothing blank or stuck loading | |
| W11 | P1 | Account: edit name and a payment handle, manage a tag, view sessions, export CSV; open Help, Feedback, Privacy, Terms | Changes persist; files and pages open | |
| W12 | P0 | At phone width, before answering the cookie banner use the bottom nav and Add; check dark mode; log out; open `/dashboard`; sign in as B | Nothing covered or clipped; redirected to login; B sees none of A's private data | |

### iPhone and Android (record each separately)

| ID | Pri | Do | Expect | iOS | Android |
|---|---|---|---|---|---|
| M1 | P0 | Fresh launch; answer the privacy sheet if shown; sign in as A; close and reopen the app | Sheet appears at most once; stays signed in. Record if the build has analytics off (no sheet) | | |
| M2 | P1 | Open Home, Expenses, Groups, Insights, Ask | All render; Home total is correct | | |
| M3 | P0 | Add an expense with category and today's date | Saved once; Home total rises by exactly that amount | | |
| M4 | P0 | Search for it, edit the amount, move another to a group, then delete one (cancel once first) | Totals follow every change | | |
| M5 | P0 | Create a group and add a member; add an equal and an unequal split | Shares add up to the cent | | |
| M6 | P0 | Edit a group expense's description; settle up; open group settings | Split unchanged; balance correct after settling | | |
| M7 | P0 | Insights: Overview and scope switch | Matches Home and the web for the same period and scope | | |
| M8 | P1 | Open Budgets, an item and a merchant detail, Cards, Tags, Recurring (add and delete one of each where possible) | Each works | | |
| M9 | P1 | Activity, Account (edit profile, export), Password & security, Feedback, About | Each opens and works | | |
| M10 | P0 | Dark mode, keyboard over forms, Android Back; sign out; sign in as B | Nothing hidden; B sees none of A's expenses, drafts or groups | | |

## Part C — Real devices and services (when the area changed, and always for a first or major release)

Automation cannot prove these: CI fakes or turns off the services. N/A needs the reason "area unchanged since release ___".

| ID | Pri | Check | Expect | Result |
|---|---|---|---|---|
| R1 | P0 | Real Google sign-in (web) | Signs in to the right account | |
| R2 | P0 | Real email: register, verify, reset password to completion, group invite (open signed out and signed in, web and app) | Links work. Known: the app drops a signed-out invite (F-014) | |
| R3 | P0 | Real receipt: web upload; phone camera and library on each device; edit items; split in a group | Items and total correct or clearly flagged; nothing sent to AI without consent | |
| R4 | P0 | Real AI: decline then allow consent; ask about spending (web and app); ask it to add an expense; off-topic question | No call before consent; figures match your data; created once; refusal is clear | |
| R5 | P0 | Real assistant connection: connect, prepare, approve, disconnect | Nothing saved without approval; access ends on disconnect | |
| R6 | P1 | Push permission, a group notification and tapping it; payment-app links | Opens the right screen or app | |
| R7 | P1 | VoiceOver or TalkBack: sign in, add expense, Ask; web keyboard only: add expense | Completable | |
| R8 | P0 | Delete a disposable account on each phone and on web | Account gone; cannot sign in | |
| R9 | P0 | Mobile analytics: UAT-ANA-001..007 | As written in `04` | |
| R10 | P0 | Install the new build over the previous release while signed in with a saved draft | No crash or data loss; draft and session behave correctly | |

## Part D — After deploy (production, read-only)

| ID | Check | How | Result |
|---|---|---|---|
| D1 | Production smoke | `make qa-prod-smoke` | |
| D2 | Serving versions and errors | `make release-verify VERSION=x.y.z` (see the deployment skill; needs deploy authorization) | |
| D3 | A look at your own account, viewing only | Dashboard and history load with expected figures | |

## Result

| Part | Passed | Failed | Blocked / not run | N/A |
|---|---|---|---|---|
| A | | | | |
| B | | | | |
| C | | | | |

**Decision:** Go ☐ No-go ☐ · **Waivers:** ____ · **Signed:** ____
