# TS-GRP-118 — Simplify-debts + group settings (default split, currency lock)

**Phase:** 2 · **Spec:** §5.1 ("Group settings"), §7.2 (greedy netting), §17 Q7 · **Status:** 📋 Planned

## Scope

Two related but separable pieces of work, both gated on already-existing-but-unused `Group` columns (`db/models.py:140-153`): `simplify_debts` (Boolean, default `False`) and `default_split_json` (JSON, currently write-only-at-creation-time and never read). Phase 1's `UpdateGroupRequest` explicitly deferred both (`api_models.py:310-311`: *"default_split/simplify_debts/currency are Phase 2"*).

1. **Simplify debts (§7.2 greedy netting).** When `groups.simplify_debts = TRUE`, `BalanceService.get_balances` (`balance_service.py:109-131`) should return `transfers` computed by the greedy-netting algorithm in §7.2 instead of the literal pairwise accrual `_pairwise_transfers` (`balance_service.py:67-107`) currently always used. Recommendation (per spec §17 Q7): default `simplify_debts` to `False` on create — "surprising transfers erode trust" — this is already the DB default, just needs a settings UI toggle.
2. **Group settings — default split.** Let a group define a default split config (e.g. 60/40) applied when adding a new group expense, pre-filling `SplitEditor`/`GroupExpenseRequest.split` instead of always defaulting to equal. Read-only persistence already exists (`default_split_json`); this ticket adds the read/update path and the web/mobile UI to set it.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/balance_service.py` — add a `_simplified_transfers(group_id) -> List[Dict]` implementing exactly the §7.2 pseudocode (sort creditors/debtors desc, greedy-match, at most `n-1` transactions); `get_balances` branches on `group.simplify_debts` to choose which transfer-builder to call, and sets `BalanceResponse.simplified` accordingly (the field already exists, `api_models.py:453-457`, currently hardcoded `False` per TS-GRP-104's ticket notes).
- `varavu_selavu_app/varavu_selavu_service/services/group_service.py` — extend `update_group` (`group_service.py:192-215`) to accept `simplify_debts: Optional[bool]` and `default_split: Optional[dict]`, validated (default_split's `type` must be a currently-supported `SplitEngine` type; `entries` structurally match `GroupSplitEntry`). Admin-only, same guard already used (`_require_admin`, `group_service.py:70-75`).
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — extend `UpdateGroupRequest` (`api_models.py:310-315`) with the two new optional fields; extend `GroupDetailResponse` (`api_models.py:333-341`, already exposes `simplify_debts`) to also expose `default_split: Optional[GroupSplitConfig]`.
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — no new route; `PUT /{group_id}` already exists (`groups_routes.py:134-143`), just needs to pass the two new fields through.
- **Web:** `varavu_selavu_ui/src/pages/GroupDetailPage.tsx` — add a `Settings` tab (currently `TabKey = 'expenses' | 'balances'` at `GroupDetailPage.tsx:44`) with a simplify-debts toggle and a default-split editor (reuse `SplitEditor` in "template" mode — no `amount`, just proportions/entries).
- **Mobile:** `varavu_selavu_mobile/src/screens/GroupDetailScreen.tsx` — same `Settings` tab addition (currently `Tab = 'expenses' | 'balances'`, `GroupDetailScreen.tsx:47`).
- `varavu_selavu_ui/src/components/groups/BalanceList.tsx` / `varavu_selavu_mobile/src/components/BalanceRow.tsx` — when `simplified: true`, consider a small "Simplified" badge near the transfers list so users understand why the suggested payments don't match raw per-expense debts.

## Acceptance criteria

- `simplify_debts=false` (default): `GET /groups/{id}/balances` behavior is byte-identical to Phase 1 (regression-test this explicitly).
- `simplify_debts=true`: transfers are the greedy-netting result — verify against a hand-computed 4-member scenario where naive pairwise accrual would produce more than `n-1` transactions and simplified produces exactly the minimal set; `Σ net(m) == 0` still holds (unaffected by which transfer algorithm is used — only `net(m)` matters for balances, `transfers` is a presentation layer on top).
- `PUT /groups/{id}` with `simplify_debts`/`default_split` — non-admin caller → `403` (existing `_require_admin` guard, unchanged).
- Default-split, once set, is surfaced to the Add-Expense flow as the pre-filled split (verify at the API contract level in this ticket; UI wiring may land with **TS-GRP-116**/**117** if the Add-Expense forms need to fetch group detail anyway — coordinate, don't duplicate).

## Dependencies

- **TS-GRP-102** (`GroupService`), **TS-GRP-104** (`BalanceService`).

## Test requirements

- Extend `varavu_selavu_app/tests/test_balances.py` with a simplify-debts-on scenario (assert both `Σ net == 0` and the exact minimal transfer set) and a simplify-debts-off regression case.
- Extend `varavu_selavu_app/tests/test_groups_api.py` with `default_split`/`simplify_debts` update cases (admin success, non-admin `403`, invalid split-type rejection).
