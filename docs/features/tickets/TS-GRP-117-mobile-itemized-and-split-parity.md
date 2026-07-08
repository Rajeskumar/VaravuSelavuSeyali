# TS-GRP-117 — Mobile: shares/adjustment/multi-payer UI + itemized split board (RN)

**Phase:** 2 · **Spec:** §3.4, §10.1, §12.1, §12.2 · **Status:** 📋 Planned

## Scope

React Native parity for **TS-GRP-116**, native-optimized per spec §12.1 ("steppers for shares, sliders for percentages"). `varavu_selavu_mobile/src/components/SplitEditor.tsx` is explicitly documented as Phase-1-only and pre-architected for this:

```
// SplitEditor.tsx:1-6
* SplitEditor.tsx — Phase 1: equal-only split selector.
* Phase 2 constraint: only "equal" split is surfaced. The component is
* architected to accept `allowedTypes` so Phase 2 can unlock percentage/exact
* splits without changing GroupDetailScreen or AddExpenseScreen.
export type SplitType = 'equal'; // Phase 2 will add: | 'exact' | 'percentage'
```

Note the mobile component is actually *behind* web here — web already has `exact`/`percentage` (Phase 1, `TS-GRP-107`); mobile only has `equal`. This ticket must bring mobile up to full parity: `exact`, `percentage` (both currently missing on mobile), plus the new `shares`/`adjustment` (**TS-GRP-113**) — four types to add in one pass, not two.

## Files it will touch

- `varavu_selavu_mobile/src/components/SplitEditor.tsx` — widen `SplitType` to `'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment'`; add native input controls per type (numeric steppers for shares, `Slider`-based or numeric input for percentage/exact — spec suggests sliders but a numeric `TextInput` with a live-updating preview is an acceptable substitute if a slider dependency isn't already in the project; check `package.json` for `@react-native-community/slider` before adding a new dependency, and prefer numeric input if it isn't already present).
- `varavu_selavu_mobile/src/components/SplitEditor.tsx`'s exported `computeEqualShares`-style helpers — add `computeExactShares`/`computePercentageShares`/`computeSharesSplit`/`computeAdjustmentSplit` preview helpers (client-side preview only; server via `resolve_split` remains authoritative, E5).
- **New:** `varavu_selavu_mobile/src/components/PayerPicker.tsx` — multi-payer selection + per-payer amount, mirroring **TS-GRP-116**'s web `PayerPicker`.
- **New:** `varavu_selavu_mobile/src/components/ItemSplitBoard.tsx` — touch-optimized item→member assignment (tap an item chip, then tap member avatars to assign; long-press for custom ratio, matching spec §10.1's "drag/assign each to member avatars (multi-select = even ratio; long-press = custom ratio)" — drag-and-drop is not required if tap-to-toggle achieves the same outcome with less RN complexity; note this as an implementation simplification if taken).
- `varavu_selavu_mobile/src/screens/AddExpenseScreen.tsx` — currently only supports `scope === 'group'` with equal split (`AddExpenseScreen.tsx:59-63` comment: *"Phase 1: equal split only"*); wire in the widened `SplitEditor`, `PayerPicker`, and (when the receipt-scan flow produces line items) `ItemSplitBoard`.
- `varavu_selavu_mobile/src/screens/GroupDetailScreen.tsx` — same `SplitEditor`/`PayerPicker` upgrade for its inline add-expense flow.
- `varavu_selavu_mobile/src/api/groups.ts` — new `addGroupExpenseWithItems(groupId, payload)` matching **TS-GRP-115**'s endpoint.

## Acceptance criteria

- All 5 split types selectable and functionally correct on mobile, matching web's reconciliation/validity behavior (§3.3 invariant, computed client-side for preview, enforced server-side).
- `PayerPicker` and `ItemSplitBoard` are usable single-handed on a phone-sized viewport (manual device/simulator check — this is the one ticket in this backlog that most needs an on-device pass, not just Jest).
- Itemized group expense submission round-trips correctly against the real (or a local dev) backend.

## Dependencies

- **TS-GRP-109** (existing mobile groups screens), **TS-GRP-113**, **TS-GRP-114**, **TS-GRP-115**, **TS-GRP-116** (share the preview-math approach so web/mobile don't silently diverge on rounding display).

## Test requirements

- Extend `varavu_selavu_mobile/src/__tests__/groups.test.ts` (currently covers the §3.3 equal-share invariant per TS-GRP-109's 6 test cases) with exact/percentage/shares/adjustment invariant cases mirroring the backend's `SplitEngine` test matrix from **TS-GRP-113**.
- New tests for `PayerPicker` and `ItemSplitBoard` (assignment logic, validity gating) using whatever RN testing setup the project already uses (check for `@testing-library/react-native` usage in existing mobile tests before introducing a new pattern).
