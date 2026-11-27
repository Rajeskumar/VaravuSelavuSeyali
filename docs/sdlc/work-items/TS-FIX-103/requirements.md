# Requirement agreement

Status: owner asked for the four fixes on 2026-11-27 (see work-item.json notes). Acceptance criteria: work-item.json.

## Problem and users
Mobile users. Found by the TS-QA-106 native flows on the iOS 27 simulator.

- P0 (AC-001): tapping a balance row records the payment in the reverse direction (guest owes me $15, recording $5 stored "me → guest"). The line is dated July and is in release tags v1.2.0 to v1.4.0. The People tab shortcut calls the same function.
- P1 (AC-002): changing a manual group expense's amount returns 400. Mobile resends the old payer amounts and old exact shares.
- P2 (AC-003): after Move to group the list shows no expense although the server returned 200.
- P2 (AC-004): iOS number pad: first tap on Save only closes the pad; the sheet header is pushed off screen.

## Outcome and scope
Mobile only. Web is checked for each: settle-up (web has no row shortcut and picks from transfers), group edit (web omits untouched payers/split for receipts only; manual expenses still resend the old split, so
Save stays disabled after an amount change; fixed under AC-005).
Excluded: backend changes; repairing any already-stored settlement (needs approved production access); the header "Settle up"
button when only others owe the viewer; other web changes.
Scope added by the owner 2026-11-27 (supersedes those two exclusions and "Mobile only"): web group edit (AC-005) and the
"Settle up" button (AC-006).

Added by the owner 2026-11-27 (later the same day): "option A" for typed amounts, AC-007: one mobile reader for Settle up
and group expense edit. Other mobile money fields are excluded (option B, ROADMAP). Also in scope since the owner's
"Fix android keyboard bug": modals with text fields stay above the Android keyboard, and split fields stay typeable there.

Added by the owner 2026-11-27: "fix all four" older wrong-amount problems found by the follow-up reviews (AC-008..AC-011).

Added by the owner 2026-11-27: fix the AC-011 typing problem in receipt, split and payer fields, and fix recurring amounts (AC-012). Budgets and card fees stay excluded (ROADMAP).

Added 2026-11-27: the owner replied "Fix it, then go" to fixing blank split fields in the app and server (AC-013). This brings one backend change into scope; older apps benefit only after the server is deployed.
