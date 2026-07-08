# TS-GRP-124 — AI Analyst: full group context expansion

**Phase:** 2 · **Spec:** §5.6, §10.2 · **Status:** ✅ Implemented

## Scope

**Important pre-existing context:** this is *not* starting from zero. `TS-ANL-013` ("Chat agent: resolve time period and scope from natural language query," `docs/features/TS-ANL-013 — Chat Agent Time Period and Scope Resolution.md`) already shipped a first slice of group-awareness in `chat_service.py`:

- `_resolve_scope_from_text` (`chat_service.py:150-165`) matches a query against the caller's own group names.
- `_fetch_group_balance_summary` + the `get_group_balance_summary` tool (`chat_service.py:168-266`) answer balance/who-owes-whom questions for one named group.
- `user_groups` is fetched via `group_service.list_groups_for_user(user_id)` (`chat_service.py:253-257`) gated behind `groups_enabled`.

What's **not yet built** is §10.2's richer context block — full per-group summaries (`my_share`, `i_paid`, `group_total`, `top_categories`) injected proactively, and the specific cross-group intents ("which group am I spending the most in", "am I usually the one paying", "what did the Goa trip cost me vs total"). This ticket builds on top of TS-ANL-013's plumbing rather than replacing it.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/chat_service.py`:
  - New helper, e.g. `_build_group_context_block(user_groups, analysis_service, user_id, period) -> dict`, producing the §10.2 shape: `{groups: [{name, my_share, i_paid, group_total, top_categories, balances_with: [{name, net}]}]}`. Source the per-group numbers from `AnalysisService._compute_group_summaries` (`services/analysis_service.py:243-...`, already computes `my_share`/`i_paid`/`group_total`/`my_balance` per group — reuse it directly rather than recomputing) plus a new small aggregation for `top_categories` per group (group the group's `expense_splits`/`Expense.category_id` — check whether `AnalysisService` already exposes a per-group category breakdown before writing a new query).
  - Inject this block into the system prompt / tool context alongside the existing `analysis_json` (per §10.2's illustrated `Group data: {...}` block), but **only when `groups_enabled` and the user has ≥1 group** — mirror the existing `if groups_enabled and group_service is not None:` guard pattern (`chat_service.py:253`).
  - New tools (LangGraph `@tool`-decorated, matching the existing `get_expense_summary`/`get_item_insights`/`get_merchant_insights`/`get_group_balance_summary` pattern at `chat_service.py:218-266`):
    - `get_group_spend_summary(group_name: str)` — returns my_share/i_paid/group_total/top_categories for one group (complements the existing balance-only tool).
    - `get_top_group_by_spend()` — answers "which group am I spending the most in" by ranking `user_groups` by `my_share`.
  - Extend `_resolve_scope_from_text` usage / add a new lightweight intent check for "vs total"/"cost me" phrasing so the model is nudged toward `get_group_spend_summary` the same way it's currently nudged toward `get_group_balance_summary` for balance questions (`chat_service.py:337-340`).
- No backend schema change — this is entirely a `chat_service.py` context/tool-surface expansion, consuming already-existing `AnalysisService`/`BalanceService`/`GroupService` methods.

## Acceptance criteria

- "How much did the Goa trip cost me vs the group total?" → correctly resolves the named group (reusing `_resolve_scope_from_text`) and answers with both `my_share` and `group_total`, clearly labeled (spec's explicit example, §4 user story 8).
- "Which group am I spending the most in?" → correctly ranks and names the top group by `my_share`.
- "Am I usually the one paying?" → answerable via `i_paid` vs `group_total`/member-count context (a reasonable heuristic: if the user's `i_paid` share across a group is disproportionately higher than an equal split would suggest, say so — this is a soft/interpretive answer, not a hard invariant; document the heuristic chosen in the implementation).
- "How much do I owe Meera?" — this is a **cross-group** question already partly covered by `get_group_balance_summary` (single-group) but not exactly this phrasing (person-named, not group-named); decide whether to extend the existing tool to accept a person's display name and search across all the user's groups, or defer full cross-person resolution to **TS-GRP-128** (cross-group friend balances) and only handle the single-group case here — recommend the latter to avoid scope creep, and note the boundary clearly in code comments.
- No regression to TS-ANL-013's existing balance-question behavior or to the personal (non-group) chat flow when `groups_enabled=False`.
- The provider-routing behavior (OpenAI prod / Ollama local) is unaffected — this only changes context injection and tool surface, not model selection (§10.2 explicit note).

## Dependencies

- TS-ANL-013 (existing group-aware chat plumbing — this ticket extends it, doesn't duplicate it), **TS-GRP-104** (`AnalysisService._compute_group_summaries`, `BalanceService`).

## Test requirements

- Extend `varavu_selavu_app/tests/test_chat_period_scope_resolution.py` (existing TS-ANL-013 test file) with: group-spend-summary tool correctness against a scripted multi-group fixture, top-group-by-spend ranking correctness, "vs total" phrasing resolution, and a `groups_enabled=False` regression check confirming the new tools/context block are absent entirely (not just empty).
