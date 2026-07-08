# TS-GRP-116 — Web: shares/adjustment/multi-payer UI + `ItemSplitBoard`

**Phase:** 2 · **Spec:** §3.4, §10.1, §11.3 · **Status:** ✅ Implemented

## Scope

Web UI parity for the three backend tickets that land the actual math (**TS-GRP-113** shares/adjustment, **TS-GRP-114** multi-payer, **TS-GRP-115** itemized). Three UI pieces:

1. **`SplitEditor` gains `shares`/`adjustment` tabs.** `varavu_selavu_ui/src/components/groups/SplitEditor.tsx` is already architected for this — `SplitType` (`SplitEditor.tsx:14`), `ALL_TYPES` (`SplitEditor.tsx:43`), and the `allowedTypes` prop (`SplitEditor.tsx:35-39,52`) exist specifically so new types slot in without a rewrite. Add `'shares' | 'adjustment'` to `SplitType`, a preview function per type (extend `varavu_selavu_ui/src/utils/splitPreview.ts` — `previewEqualSplit`/`previewPercentageSplit` already exist per the imports at `SplitEditor.tsx:10`; mirror the backend rounding logic client-side for the live preview only, server remains authoritative per E5), and per-type input affordances (steppers for share counts, a signed `+/-` field for adjustments) alongside the existing `exact`/`percentage` numeric fields (`SplitEditor.tsx:164-178`).
2. **Multi-payer picker.** Both `AddExpenseForm.tsx` (personal/group add-expense dialog) and `GroupDetailPage.tsx`'s inline add-expense dialog currently render a single `TextField select label="Paid by"` (`GroupDetailPage.tsx:368`) bound to one `payerId`. Replace with a component that lets the user check multiple members and assign `amount_paid` per payer, with a live "paid total must equal amount" banner — same visual pattern as `SplitEditor`'s reconciliation banner (`SplitEditor.tsx:194-205`).
3. **New `ItemSplitBoard` component** (`varavu_selavu_ui/src/components/groups/ItemSplitBoard.tsx`) — receipt line items rendered as chips; click/drag to assign each item to one or more member avatars (multi-select = even ratio across selected members; a secondary control sets a custom ratio). Wire into the receipt-scan step of `AddExpenseForm.tsx`: today, when `mode === 'group'`, the parsed-receipt items are silently dropped (see the comment at `AddExpenseForm.tsx:388-391`: *"itemized group expenses yet, even if the receipt parsed line items"*, and again at `AddExpenseForm.tsx:758-760`). Replace that dead branch with: if the receipt has items and the group is selected, show `ItemSplitBoard` instead of the flat `SplitEditor`, and submit via `createGroupExpenseWithItems` (new API client function) → `POST /groups/{id}/expenses/with_items`.

## Files it will touch

- `varavu_selavu_ui/src/components/groups/SplitEditor.tsx`, `varavu_selavu_ui/src/components/groups/SplitEditor.test.tsx`
- `varavu_selavu_ui/src/utils/splitPreview.ts` (new `previewSharesSplit`, `previewAdjustmentSplit`)
- **New:** `varavu_selavu_ui/src/components/groups/PayerPicker.tsx` — used by both `AddExpenseForm.tsx` and `GroupDetailPage.tsx` (avoid duplicating the multi-payer UI in two places, unlike Phase 1 where each screen inlined its own single-payer select).
- **New:** `varavu_selavu_ui/src/components/groups/ItemSplitBoard.tsx`, `ItemSplitBoard.test.tsx`
- `varavu_selavu_ui/src/components/expenses/AddExpenseForm.tsx` — replace the dead-branch comments at lines ~388-391 and ~758-760 with the real itemized-group path.
- `varavu_selavu_ui/src/pages/GroupDetailPage.tsx` — swap the inline `payerId` select (line 368) for `PayerPicker`; widen `SplitEditor`'s `allowedTypes` (it currently gets all three Phase-1 types by omission per the comment at `SplitEditor.tsx:35-38` — confirm it isn't hardcoded down to 3, and add the two new types to whatever list it passes).
- `varavu_selavu_ui/src/api/groups.ts` — new `createGroupExpenseWithItems(groupId, payload)` client function matching **TS-GRP-115**'s new endpoint/request shape.

## Acceptance criteria

- `SplitEditor` with `allowedTypes` including `shares`/`adjustment` renders steppers/adjustment fields, computes a correct live preview, and reports `onValidityChange` correctly (shares: no reconciliation target needed since it always resolves; adjustment: valid once `Σ(base + adjustments) ≈ amount`, which is automatic — the "invalid" state here should instead flag `Σ(adjustments) > amount`).
- `PayerPicker`: selecting 2+ members and entering `amount_paid` per member reconciles against the total; submit is disabled until it does (mirrors the existing `!splitValid` gate pattern at `AddExpenseForm.tsx:369-370`).
- `ItemSplitBoard`: assigning every parsed item to at least one member enables submit; an unassigned item blocks submit with an inline warning; multi-select-with-no-custom-ratio defaults to even split among selected members.
- Submitting an itemized group expense calls `POST /groups/{id}/expenses/with_items` and, on the group-scoped-duplicate-receipt `409` (E7), surfaces the "X already added this receipt" message inline (mirror the existing personal duplicate-receipt handling if one exists in this form; otherwise this is new UX).
- Manual browser verification: scan a real multi-item receipt, mark it a group expense, assign items across 2+ members with one item split 50/50, submit, and confirm the group's expense list + balances reflect the itemized split.

## Dependencies

- **TS-GRP-107** (existing `SplitEditor`/`GroupDetailPage`/`AddExpenseForm` group integration), **TS-GRP-113**, **TS-GRP-114**, **TS-GRP-115** (backend contracts this UI calls).

## Test requirements

- Extend `SplitEditor.test.tsx` with shares/adjustment cases (preview correctness, validity gating).
- New `ItemSplitBoard.test.tsx`: assignment, multi-select even-ratio default, custom-ratio override, unassigned-item warning.
- Extend `AddExpenseForm`'s existing test coverage (if any) or add a focused test for the itemized-group submit path, mocking `createGroupExpenseWithItems`.
