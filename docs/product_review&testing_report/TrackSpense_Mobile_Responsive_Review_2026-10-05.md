# TrackSpense mobile and responsive UX review

Date: 2026-10-05 · Reviewer: Codex · Local web app: http://localhost:3000/ · HEAD at review: `1fe311f`

## Verdict

**Mobile readiness: 74/100. Not ready for unrestricted mobile launch approval.** The layouts are generally responsive and the core destinations remain available, but the primary mobile amount-entry control is inaccessible to keyboard users and poorly exposed to assistive technology. Narrow dialogs also clip controls, and the fixed header partially covers the expense-detail close control.

No universal P0/Blocker outage was demonstrated. There is a **High/P1 accessibility launch gate** and several Medium issues to resolve. This is a mobile-web UX assessment, not a repeat of the desktop/security audit and not a native iOS/Android review.

## Method and scope

- Browser viewport sizes: **375×812**, **430×932**, **768×1024** CSS pixels. Additional **375×480** chat height check.
- Live screenshots, UI interactions, read-only DOM geometry, focusability/semantics inspection, and targeted source checks.
- Tested light and dark themes on representative authenticated screens; light authentication/public pages. This was representative coverage, not every screen × width × theme permutation.
- Existing synthetic review account reused. No new expenses, budgets, settlements, invitations or accounts created. One AI question used to inspect a real response. Signed out and successfully back in; original light theme and default viewport restored.
- Main navigation retains its bottom tabs at **all three tested widths**, including 768px. The 768px header adds the product name; the expense workflow still uses its mobile keypad sheet.
- Actual touch hardware, browser chrome, software keyboard, VoiceOver/TalkBack, safe-area insets, and Safari/Android browser behavior were not emulated by resizing. The short-height test is **not proof of real keyboard compatibility**.
- Normal loading transition and search-empty state observed. Network/error-state layouts were not fault-injected; no claims of full offline/error resilience.

## Score breakdown

| Dimension | Score | Basis |
|---|---:|---|
| Navigation and feature reachability | 17/20 | Bottom tabs and account menu work; core features remain reachable |
| Responsive layout and content | 15/20 | Main pages fit; narrow settings/split controls clip |
| Touch and accessible interaction | 9/20 | Keypad lacks button semantics/focus; several undersized controls |
| Forms, sheets and keyboard readiness | 11/15 | Forms mostly readable; detail overlap, phone hints and real-keyboard gaps |
| Readability and theme consistency | 13/15 | Good overall hierarchy; dark date icon and small secondary text |
| States and mobile workflow continuity | 9/10 | Useful empty states, chat reflows; broader failures still untested |
| **Total** | **74/100** | Expert review score, not a standardized compliance score |

## Issues

### M-01 — High — Amount keypad cannot be operated through normal keyboard focus

- **Screen/workflow:** New expense → mobile amount entry.
- **Device width:** 375, 430, 768px; all use the same mobile sheet.
- **Issue:** Numeric keys are clickable `DIV`s, with no button role, accessible label, keyboard handler or focusability. Inspected key `1`: `tag=DIV`, `role=null`, `tabIndex=-1`. The amount display is not an editable input. Accessibility snapshots expose digits as generic text, not controls.
- **Why it hurts:** Keyboard/switch users cannot enter an amount through the primary manual flow; screen-reader users do not get proper keypad controls. Desktop's editable amount field is replaced by this less accessible interaction on all tested widths.
- **Recommended fix:** Use semantic buttons with digit/decimal/backspace labels and Enter/Space support, plus a labeled amount input with decimal keyboard hints and paste support. Preserve a clear focus order and announce changed values appropriately.
- **Priority:** P1, mobile accessibility launch gate.
- **Evidence:** [Tablet keypad](mobile-review-2026-10-05/768-keypad-dark.png). Source: `varavu_selavu_ui/src/components/expenses/QuickCaptureSheet.tsx`, mobile `KEYS.map` block.

### M-02 — Medium — Sticky app header partially covers expense-detail header and close control

- **Screen/workflow:** Expenses → tap an expense row → detail/edit sheet.
- **Device width:** 375px reproduced directly, without needing a resize.
- **Issue:** Sheet date heading is hidden and the upper portion of the close icon sits behind the fixed app bar. Close button rectangle begins at y=41, height≈36; app header ends around y=58. The lower part remains clickable, so this is not a complete navigation lock.
- **Why it hurts:** The exit control appears cut off and its usable target shrinks; users may not recognize how to dismiss an edit form.
- **Recommended fix:** Put modal sheets and their backdrop above the app bar, or consistently offset them below it. Give the sheet a stable visible header and at least a 44px close target.
- **Priority:** P1.
- **Evidence:** [Overlapping header](mobile-review-2026-10-05/375-detail-header-overlap.png). Source: `App.tsx` app-bar z-index is drawer+1; review `ExpenseDetailSheet.tsx` drawer sizing/layering.

### M-03 — Medium — Group member actions clip inside narrow settings dialog

- **Screen/workflow:** Groups → Group settings → member actions.
- **Device width:** 375px. The row fits at 430px; 768px also has adequate room.
- **Issue:** “Email invite,” “Copy link,” and “Remove” remain in one row. Remove extends to x≈359 while the dialog ends at x=343; visible label is clipped. The action row is ≈302px inside a ≈261px content area.
- **Why it hurts:** Users cannot clearly see the entire destructive action, and the smaller visible target is harder to operate confidently.
- **Recommended fix:** Wrap/stack member actions, use a labeled overflow menu, or use a full-width mobile settings sheet. Keep all action labels and hit areas inside the dialog.
- **Priority:** P1.
- **Evidence:** [375px settings](mobile-review-2026-10-05/375-group-settings-dark.png).

### M-04 — Medium — Split-method selector runs past the phone edge

- **Screen/workflow:** New group expense → split “equally” → split editor.
- **Device width:** 375px.
- **Issue:** Adjustment extends to x≈404 beyond the 375px viewport. Its immediate containers are wider than the content region without a visible overflow cue. The label is cut off; other modes remain visible.
- **Why it hurts:** A valid split method looks missing or unfinished and is difficult to discover on the narrowest tested phone.
- **Recommended fix:** Wrap methods into two rows, use a dropdown, or use an explicitly horizontally scrollable tab list with a visible cue and focus scrolling. Keep complete method labels available.
- **Priority:** P1.
- **Evidence:** [Split method clipping](mobile-review-2026-10-05/375-split-options.png).

### M-05 — Medium — Floating Add button obscures dashboard/analysis figures

- **Screen/workflow:** Dashboard category totals; Analysis overview breakdown.
- **Device width:** 375×812px. At the tested 430×932 and 768×1024 initial positions it did not cover those same totals; obstruction depends on vertical scroll position and height.
- **Issue:** The floating button overlaps the right side of the category breakdown, where amounts and percentages are displayed.
- **Why it hurts:** Reading a financial summary requires extra scrolling to reveal values. Moving the same fixed button across content creates recurring occlusion.
- **Recommended fix:** Reserve a non-overlapping action area, integrate Add into the bottom bar, or adapt/hide the floating action during content reading. Bottom padding alone cannot prevent overlap at intermediate scroll positions.
- **Priority:** P2.
- **Evidence:** [Dashboard](mobile-review-2026-10-05/375-dashboard-light.png), [Analysis](mobile-review-2026-10-05/375-analysis-light.png).

### M-06 — Medium — Important touch targets are too small for comfortable use

- **Screen/workflow:** Dashboard scope toggle; capture options/payer/split links; split editor; budgets.
- **Device width:** 375, 430, 768px, with shared controls retaining compact sizes.
- **Issue:** Measured examples: My expenses/I paid 24px high; payer “you” ≈25×24px; “equally” ≈49×24px; Add tag ≈57×21px; split-method buttons 30px high; split Close ≈31×31px. These are substantially below a 44×44px design target. This is a usability target, not a formal WCAG failure claim.
- **Why it hurts:** Small adjacent controls increase missed taps and accidental selection, especially one-handed. Top-header actions already provide 44px targets, so the inconsistency is noticeable.
- **Recommended fix:** Expand hit areas and spacing independently of visual text size. Use 44px minimum targets for primary touch interactions and verify no overlapping hit areas.
- **Priority:** P2.
- **Evidence:** DOM geometry measurements; [split editor](mobile-review-2026-10-05/375-split-options.png).

### M-07 — Medium — Native date-picker icon is nearly invisible in dark mode

- **Screen/workflow:** New expense and expense detail date fields.
- **Device width:** 375px detail and 768px capture observed.
- **Issue:** Calendar indicator is dark against the near-black field. Computed `color-scheme` on the date input is `normal` despite light input text and a dark surface.
- **Why it hurts:** Users may not discover that a date picker is available and must target a poorly visible icon.
- **Recommended fix:** Apply a matching native control color scheme for dark mode, or provide an explicitly themed, accessible picker icon. Verify appearance in actual Safari and Chrome.
- **Priority:** P2.
- **Evidence:** [Dark capture date field](mobile-review-2026-10-05/768-keypad-dark.png), [dark detail](mobile-review-2026-10-05/375-expense-detail-dark.png).

### M-08 — Low — Mobile entry ergonomics need clearer input affordances

- **Screen/workflow:** Login/register, Profile phone, AI chat composer.
- **Device width:** Login/register at 375/430/768; phone at 375; chat at 375/430.
- **Issue:** Auth forms have no password-reveal button. Profile Phone is `type=text` with no `inputmode` or autocomplete. Chat composer is 14px, while most form fields are ≈17px.
- **Why it hurts:** Password mistakes are harder to correct, phone entry needlessly starts with a text-oriented field, and chat entry text is small. Actual operating-system keyboard choice and browser zoom were not tested.
- **Recommended fix:** Add accessible show/hide password, `type=tel`/appropriate autocomplete for phone, and at least 16px composer text. Verify these on real devices.
- **Priority:** P2.
- **Evidence:** [Login](mobile-review-2026-10-05/375-login-light.png), [chat](mobile-review-2026-10-05/430-chat-dark.png); DOM attributes measured.

### M-09 — Low — Settled group summary pushes the useful transaction content down

- **Screen/workflow:** Group detail with all members settled.
- **Device width:** 375/430; same expanded arrangement also seen at 768.
- **Issue:** Expanded balances repeat the settled state in the group summary, header, member rows and another message, followed by a prominent Settle up action despite zero debt. At phone widths this consumes most of the initial screen before expenses.
- **Why it hurts:** Users must scroll through redundant information to reach the group's main content. The action hierarchy emphasizes a task with nothing to settle.
- **Recommended fix:** Default to a compact collapsed settled summary, demote custom settlement entry, and prioritize recent expenses and Add Expense.
- **Priority:** P2.
- **Evidence:** [375px group](mobile-review-2026-10-05/375-group-dark.png), [tablet group](mobile-review-2026-10-05/768-group-dark.png).

## What worked well

- Bottom navigation remains clear and usable at all three widths; profile/support/legal destinations remain reachable via account menu.
- Main Dashboard, Expenses, Analysis, Cards and landing views showed no page-wide horizontal overflow in the measured states. Inner control clipping is listed separately above.
- Search, filters, transaction cards, empty-search guidance, recurring form, budget form, and category popup reflow reasonably. Expanded capture content can scroll to Save; the button was not permanently lost.
- Tapping a transaction opens the edit/detail sheet, so editing is not dependent on desktop hover icons.
- Chat content and composer remain within the viewport in both normal and 375×480 reduced-height checks; answer content can scroll separately. A real AI response was inspected.
- Light/dark surfaces and main text are broadly consistent. Header buttons are 44px, major save actions are approximately 44–48px, and keypad visual keys are 46px high even though their semantics are defective.
- Item-insight limited-data messaging and expense search-empty messaging are understandable and fit narrow screens.
- Login fields use email/password types and readable field text; login succeeded after restoring the test session.

## Coverage and limits

| Workflow | Widths reviewed | Notes |
|---|---|---|
| Dashboard/navigation | 375, 430, 768 | Light/dark examples; target measurements |
| Expense capture / category / splits | 375, 430, 768 | Entry/sheets; no record submitted |
| Transaction list / search / detail | 375, 430, 768 | Empty state, detail access and layering |
| Recurring and budget forms | 375 | Layout and field inspection; no submission |
| Analysis overview | 375, 768 | Chart/filter layouts |
| Cards | 375, 430, 768 | Responsive comparisons and estimate copy |
| Items and item detail | 375 | Existing synthetic purchases, limited-data state |
| Group detail/settings | 375, 430, 768 | Member actions, balances, split popup |
| Profile/account menu | 375, 768 | Scrolling, phone field, lower actions |
| AI chat | 375, 430; 375×480 height check | Dark, loading and actual response |
| Public landing | 375 | Light hero/product-tour navigation fit |
| Login/registration | 375, 430, 768 | Registration view only; existing-account login restored |

Not exercised: real receipt camera/upload permission sheets, native share/download dialogs, real on-screen keyboard, long multi-person split datasets, network failures, actual screen readers, landscape/notched devices or native apps. Browser text sizing/contrast was not exhaustively certified. The review does not claim every desktop feature has full mobile parity.

## Priorities and launch decision

### P0

None demonstrated: no universal mobile outage or unrecoverable data-loss issue found in this scope.

### P1 — before mobile launch approval

1. M-01: accessible amount entry and keypad.
2. M-02: sheet/app-header stacking and close-target visibility.
3. M-03/M-04: remove clipping in member actions and split methods at 375px.
4. Confirm keyboard, safe-area and focus behavior on real iOS Safari and Android Chrome after these changes. This is an unverified release requirement, not an observed device bug.

### P2 — polish and interaction reliability

M-05–M-09: remove floating-action occlusion, enlarge touch targets, theme native date controls, improve input ergonomics and simplify settled-group hierarchy.

**Ready to launch on mobile? No, not for full public approval yet.** The product is usable for ordinary touch-based exploration and suitable for a controlled beta, but the primary-entry accessibility gap and clipped/overlapping controls should be corrected first. Retest the P1 paths at all three widths and on real devices before sign-off.
