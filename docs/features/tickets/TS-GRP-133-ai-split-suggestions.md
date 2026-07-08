# TS-GRP-133 — AI split suggestions (item→member assignment from history)

**Phase:** 3 · **Spec:** §5.6, §14 Q6 context, §17 · **Status:** 📋 Planned

## Scope

§5.6: "LLM suggests item→member assignment from history ('Alice usually buys the oat milk')." This augments **TS-GRP-116/117**'s `ItemSplitBoard` with a suggested assignment the user can accept or override — it never auto-submits an assignment without confirmation (itemized splits directly affect money owed; a wrong silent suggestion is a trust-breaking bug, not a minor UX miss).

## Design approach (spec is directional, not prescriptive here)

Two viable approaches; **recommend starting with the heuristic approach** and only reaching for an LLM call if the heuristic proves insufficient in practice, since it's cheaper, faster, fully deterministic/testable, and this ticket's own spec citation frames the *outcome* ("Alice usually buys the oat milk") rather than mandating an LLM as the mechanism:

- **Heuristic (recommended first pass):** for a given group + item name (normalized via the existing `canonicalize_name` from `services/insight_analytics_service.py:26-31`, reused rather than reinvented), query the group's historical `expense_item_splits` joined to `expense_items.normalized_name`, and rank members by how often they've been assigned that item (or items with a similar normalized name) in the past. Surface the top candidate(s) as a pre-checked (but still editable) suggestion.
- **LLM fallback/enhancement:** if the heuristic has too little history to be useful (new group, or an item never seen before), optionally ask an LLM (reusing `chat_service.py`'s existing provider routing — OpenAI prod / Ollama local) to guess a category-level assignment pattern (e.g. "produce items are usually split by whoever does the shopping this week") — this is genuinely optional scope; ship the heuristic alone first and treat the LLM enhancement as a stretch goal within this ticket, not a blocker.

## Files it will touch

- **New:** `services/split_suggestion_service.py` — `suggest_assignment(group_id, item_name, actor_email) -> List[Dict]` (ranked member suggestions with a confidence-style label, reusing the existing `classify_confidence`-style pattern from `insight_analytics_service.py:13-24` for consistency with how confidence is already communicated elsewhere in this codebase's insights UI).
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — new `GET /{group_id}/items/suggest_assignment?item_name=` route.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `SplitSuggestionDTO`.
- **Web:** `ItemSplitBoard.tsx` (from **TS-GRP-116**) — on parsing a receipt, call the suggestion endpoint per item and pre-check the suggested member(s), visually distinguished from a user's manual selection (e.g. a subtle "suggested" badge) so it's clear this is an editable guess, not a fact.
- **Mobile:** same integration in `ItemSplitBoard.tsx` (from **TS-GRP-117**).

## Acceptance criteria

- Suggestions are **never** auto-submitted — they only pre-fill the editable assignment UI; the user must still confirm before the expense is saved.
- A group with no history for an item returns no suggestion (empty list) rather than a low-confidence guess presented as if reliable — matches this codebase's existing confidence-suppression posture (TS-ANL-009: "low-confidence claims are suppressed").
- Suggestion ranking is correct against a scripted history fixture (member X assigned item Y in 4 of 5 past occurrences → X is the top suggestion).
- Suggestion query performance is acceptable for a group with hundreds of historical items (index `expense_items.normalized_name` if not already indexed — check `db/models.py:46-64` before assuming).

## Dependencies

- **TS-GRP-115** (`expense_item_splits` data this reads), **TS-GRP-116/117** (`ItemSplitBoard` UI this augments).

## Test requirements

- New `varavu_selavu_app/tests/test_split_suggestions.py`: ranking correctness against a scripted history, no-history-returns-empty, normalized-name matching across near-duplicate item names (reuse the existing canonicalization test fixtures if present).
