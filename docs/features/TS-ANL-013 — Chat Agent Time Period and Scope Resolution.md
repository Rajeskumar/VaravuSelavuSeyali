**Status:** ✅ Built — investigated and implemented 2026-07-06 (see findings below, and "Implementation notes" at the end of this document; [FEATURE_STATUS.md](../FEATURE_STATUS.md) not yet updated to reflect this).

### TS-ANL-013 — Chat agent: resolve time period and scope from natural language query

## Investigation findings (read this first)

This ticket exists because the Reconcile redesign's AI Analyst rebuild (`TS-DES-109`) wants a
"Looked at: {period} · {scope}" chip under every assistant answer, reflecting what the backend
*actually* resolved from the user's free-text question. Before scoping that as new work, the
following was verified directly against the code (not assumed from any doc):

**Root spec's §17 Future Roadmap** (`docs/TrackSpense_Complete_Product_Specification.md`) has a
2026-07-04 "Superseded" banner on the whole section, explicitly deferring to `FEATURE_STATUS.md`
for anything analytics/AI-related. Its own surviving bullet on this topic is one line: *"❌ RAG-based
intent detection routing to item/merchant data — not built; the chat uses a LangGraph tool-calling
agent instead (see TS-ANL-005, currently broken — see FEATURE_STATUS.md)."* That "currently broken"
clause is itself stale relative to `FEATURE_STATUS.md`, which says TS-ANL-005 is done (see below) —
the root spec was patched for §3.4 but this §17 bullet wasn't fully reconciled, illustrating exactly
why the freshness note tells readers to trust `FEATURE_STATUS.md` over this section.

**`FEATURE_STATUS.md`** (§2, §3) confirms **TS-ANL-005 is ✅ built**, but as a *different* mechanism
than "intent routing" in the sense this ticket needs: `build_rag_context()` matches the query
against the user's own item/merchant *names* (substring match) and injects the matched detail into
the LLM's system prompt; a 3-tool LangGraph ReAct agent (`get_expense_summary`/`get_item_insights`/
`get_merchant_insights`) handles everything else. This is entity-name routing (which item/merchant
is this about), not temporal or personal/group scope routing (which time window, whose money) —
confirmed by reading `TS-ANL-005`'s own requirements doc, which only ever discusses merchant/item
intent, never date phrases or group scope. **No overlap with this ticket; no duplicate work.**

**Read the actual code** (`chat_service.py`, `insight_analytics_service.py`, `analysis_service.py`,
`routes.py`, plus a repo-wide grep for any NLP/date-phrase parsing utility):

- `_resolve_chat_period()` in `chat_service.py` is the *only* period-resolution logic that exists,
  and it is **entirely parameter-based, not text-derived**: precedence is explicit
  `start_date`/`end_date` → `year`/`month` → a hardcoded rolling-last-3-months default. It never
  reads `query_text` (the user's actual message) at all. `ChatRequest` (confirmed in
  `models/api_models.py`) requires the *client* to already know and send the period — there is no
  path from "what did the user type" to "what date range was used."
- `build_rag_context()` (`insight_analytics_service.py`) does substring name-matching for items and
  merchants only. It has no date-phrase logic whatsoever — no regex, no keyword list, no library
  (`dateparser`/`parsedatetime`/etc. — confirmed absent via repo-wide grep) for phrases like "last
  month," "since February," "this quarter."
- **The LLM itself *can*, at its own unstructured discretion, decide to call `get_expense_summary`
  with different dates if it infers something from phrasing** — this is a real possibility given
  it's a tool-calling agent with the raw query text in context. But this is not a built feature: it
  is non-deterministic, unverified, untested, and — critically — **produces no structured output the
  client could ever read**, because `ChatResponse` (confirmed in `api_models.py`) is just
  `{"response": str}`. Even in the best case where the LLM happens to interpret "last month"
  correctly, there is no way for the API response to tell the client that's what happened. A UI chip
  reading "Looked at: ..." has nothing to bind to today, regardless of how well the LLM guesses.
- **Personal-vs-group scope inference does not exist in any form.** Unlike the premise this ticket
  was asked to double-check, **Groups' data model is not missing from this codebase** — `GroupService`
  and `BalanceService` are fully built and merged (`services/group_service.py`,
  `services/balance_service.py`, confirmed present with working `list_groups_for_user(email)` and
  `get_balances(group_id, actor_email)` methods, gated by a real `settings.GROUPS_ENABLED` flag).
  The actual blocker is narrower and more tractable than "Groups doesn't exist yet": **`chat_service.py`
  has zero references to groups at all** (confirmed via grep — no `group` token anywhere in the
  file), so none of its 3 tools can answer a group question even if the LLM correctly identified one.
  This is buildable now, not blocked on unfinished Groups infrastructure.

**Verdict: (c) — neither capability exists in any real form.** The closest thing to (a) is the LLM's
unstructured, unverifiable ability to sometimes infer a date range on its own when calling a tool —
but that doesn't rise to "exists and works" for the purposes of a UI chip that needs a guaranteed,
structured, server-returned value every time. Nothing here is "broken" in the TS-ANL-005 sense
(nothing partially built and mis-wired) — it's simply unbuilt. Proceeding with full implementation
per the scope below, not stopping at documentation.

## Objective

Give the chat endpoint (`POST /analysis/chat`) the ability to (1) deterministically resolve a
concrete date range from the natural-language query text itself, falling back to the app-wide
current-month default when no period is stated, and (2) resolve whether the question is about the
user's personal expenses or a specific group, by matching group names mentioned in the query — then
return **both** as structured fields on the response, not just embed them invisibly in the prose
answer.

## Requirements

- **Period resolution**, in this precedence order:
  1. A recognizable natural-language period phrase in the query text (see the phrase list below).
  2. Explicit `start_date`/`end_date` or `year`/`month` on `ChatRequest`, exactly as today (a client
     that already knows the scope — e.g. a deep link from Item Insights — should still be able to
     force it).
  3. **Default: the current calendar month** — not the existing rolling-last-3-months default.
     This is a deliberate behavior change to match the default used everywhere else in the app
     (`DashboardPage`, `ExpenseAnalysisPage`, Item/Merchant Insights all default to "this month" or
     an explicit month picker defaulting to today's month — the chat endpoint is the only surface
     using a rolling 3-month window). Flagging this explicitly since it changes existing behavior
     for every client that doesn't send an explicit period today, not just new callers.
  - Recognized phrases (deterministic keyword/regex parsing, not a second LLM call — consistent
    with this codebase's existing "keyword-based, pragmatic" style per `FEATURE_STATUS.md` §3's own
    framing of the RAG work): "last month," "this month," "this year," "last year," "last quarter,"
    "last N months"/"past N months," "since {Month}[ {Year}]," "in {Month}[ {Year}]." Not
    exhaustive — document what's covered and treat anything unrecognized as "no phrase found," not
    an error, falling through to precedence steps 2–3.
- **Scope resolution:** match the query text against the names of groups the user actually belongs
  to (`GroupService.list_groups_for_user`), case-insensitive substring match, same spirit as
  `build_rag_context()`'s existing item/merchant matching. If a group name matches, resolve
  `scope=group` with that group's id/name; otherwise `scope=personal`. Deliberately conservative:
  generic "I owe"/"split" language that doesn't name a specific group stays `personal` rather than
  guessing which group — a wrong group guess is worse than defaulting to personal and letting the
  user name the group explicitly on a follow-up. Gate this entirely behind `settings.GROUPS_ENABLED`
  (matching how every other group-aware backend path is gated) — when the flag is off, scope is
  always `personal`, full stop, no group-name matching attempted.
- **New group-aware tool** for the LangGraph agent, `get_group_balance_summary(group_name: str)`,
  calling `GroupService.list_groups_for_user` (resolve name → id) then
  `BalanceService.get_balances(group_id, actor_email)` — without this, resolving `scope=group`
  correctly is cosmetic (the chip would say "Weekend Trip · Group" while the agent still has no way
  to actually answer the question). Also gated behind `GROUPS_ENABLED` — only registered as an
  available tool when the flag is on.
- **Extend `ChatResponse`** (currently `{"response": str}`, in `models/api_models.py`) with two new
  structured fields:
  ```python
  class ResolvedPeriod(BaseModel):
      start_date: str   # YYYY-MM-DD
      end_date: str     # YYYY-MM-DD
      label: str        # human-readable, e.g. "July 2026", "Q2 2026", "the last 3 months"
      source: Literal["parsed_from_query", "explicit_param", "default"]

  class ResolvedScope(BaseModel):
      kind: Literal["personal", "group"]
      group_id: Optional[str] = None
      group_name: Optional[str] = None

  class ChatResponse(BaseModel):
      response: str
      resolved_period: ResolvedPeriod
      resolved_scope: ResolvedScope
  ```
  This is additive to the response shape — existing clients that only read `.response` are
  unaffected. TS-DES-109's "Looked at: ..." chip is the intended consumer, but wiring the web/mobile
  chat client to read and render these new fields is that ticket's job, not this one — **this
  ticket is backend-only**, per its own scope.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/chat_service.py` — new
  `_parse_period_from_text(query, today)` (deterministic phrase parser, returns `None` when nothing
  recognized), new `_resolve_scope_from_text(query, user_groups)`, both called from
  `call_chat_model` before/alongside the existing `_resolve_chat_period`; new
  `get_group_balance_summary` tool (registered only when `GROUPS_ENABLED`); `call_chat_model`'s
  return type changes from `str` to a small internal result carrying the response text +
  resolved period/scope (or the route layer computes the resolution alongside calling it — decide
  at implementation time which is cleaner; the resolution values need to reach the route either way).
- `varavu_selavu_app/varavu_selavu_service/api/routes.py` — `analysis_chat` route: inject
  `GroupService`/`BalanceService` (reusing the existing DI providers already defined in
  `groups_routes.py` — import them rather than redefining) alongside the existing
  `analysis_service`/`analytics_service`/`insight_service`; construct the extended `ChatResponse`.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — add `ResolvedPeriod`/
  `ResolvedScope`, extend `ChatResponse` as above.
- **New test file** `varavu_selavu_app/tests/test_chat_period_scope_resolution.py` (the existing
  `test_chat_service.py` at the repo root is a manual smoke script, not a pytest suite — this
  ticket's tests belong in the real `tests/` directory alongside every other backend test).

## Acceptance criteria

- Each recognized phrase ("last month," "this year," etc., see the list above) resolves to the
  correct date range and label, verified with fixed fake "today" dates spanning a few different
  months/years (so month-boundary/year-boundary logic is actually exercised, not just tested at
  one arbitrary point in time).
- No period phrase + no explicit params → current calendar month (not the old 3-month rolling
  window) — this is a deliberate, documented behavior change.
- No period phrase + explicit `year`/`month`/`start_date`/`end_date` sent → those still win, exactly
  as today (regression check against the existing deep-link-with-explicit-scope use case).
- A query naming one of the user's real groups resolves `scope=group` with the correct id/name;
  a query not naming any group (including generic "I owe"/"split" phrasing) resolves
  `scope=personal`; with `GROUPS_ENABLED=false`, scope is always `personal` regardless of query text.
  Standard multi-tenant guard: the group-name match is scoped to `GroupService.list_groups_for_user`
  (the caller's own groups) — never matches or leaks another user's group name.
- A real "how much do I owe in {group}" question, asked against seed data with a known balance, gets
  a correct answer via the new `get_group_balance_summary` tool — not just a correctly-labeled chip
  with a wrong or empty answer underneath.
- `ChatResponse` includes `resolved_period`/`resolved_scope` on every call; existing clients reading
  only `.response` are unaffected (verified by not touching the `response` field's own content/shape).
- No frontend files touched — this is backend-only, per its own scope.

## Dependencies

None from other in-flight tickets. Groups' backend (`GroupService`/`BalanceService`) is already
built and merged — this ticket consumes it, doesn't wait on it. This ticket is itself a dependency
for `TS-DES-109`'s "Looked at: ..." chip to become real (that ticket currently ships with a
documented placeholder pending this work).

## Test requirements

Unlike the `TS-DES-1xx` (frontend Reconcile redesign) tickets, this is backend service/API logic —
normal automated test coverage applies, not manual-only visual verification:
- Unit tests for `_parse_period_from_text` covering every recognized phrase plus at least one
  unrecognized-phrase case (must return `None`, not raise or guess).
- Unit tests for `_resolve_scope_from_text` covering: a real group name match, a near-miss/partial
  name, no match, and the `GROUPS_ENABLED=false` case.
- An integration test against a real (SQLite test) DB seeding a user with a group + known balance,
  asking a chat question naming that group, and asserting both the resolved-scope fields and that
  the answer text reflects the real balance (not just that a tool was called).
- A regression test confirming existing callers that send explicit `year`/`month` (e.g. the Item/
  Merchant Insights "Ask AI about this X" deep-link) still get that exact period honored, unchanged.
- Full existing backend suite must stay green — this touches shared route/service/model files.

## Implementation notes (post-build)

- **`ResolvedPeriod`/`ResolvedScope` added, `ChatResponse` extended** exactly as specified above
  (`models/api_models.py`) — additive only, existing `.response`-only consumers unaffected.
- **`chat_service.py`:** `_parse_period_from_text(query, today)` implements the phrase list exactly
  as scoped (last month/this month/this year/last year/last quarter/last-or-past N months/since
  {Month}[{Year}]/in {Month}[{Year}]), returns `None` for anything unrecognized. `_resolve_chat_period`
  now takes `query_text` as its first argument and tries the phrase parse before falling through to
  explicit params, then the **current-month default** (replacing the old rolling-3-month default, as
  specified). `_resolve_scope_from_text(query, user_groups)` does the group-name substring match.
  `call_chat_model`'s signature grew three new optional params (`group_service`, `balance_service`,
  `groups_enabled`, all defaulting to off/`None`/`False`) and its return type changed from `str` to a
  new `ChatResult` dataclass (`response`, `resolved_period`, `resolved_scope`) — every existing
  `return "..."` site in the function was converted to build a `ChatResult` via a small `_result()`
  helper, so no return path was missed.
- **New tool `get_group_balance_summary`**, registered only when `groups_enabled and group_service
  and balance_service` are all present — its actual lookup logic was extracted to a standalone
  `_fetch_group_balance_summary(group_name, user_groups, balance_service, actor_email)` function
  rather than left as a closure, specifically so it's unit-testable without invoking the LangGraph
  agent (which would otherwise require a real LLM in tests). The tool itself is a one-line wrapper
  around it. When the resolved scope is `group`, the system prompt gets one extra sentence naming
  the group and nudging the agent toward this tool for balance questions.
- **`routes.py`'s `analysis_chat`:** imports `get_group_service`/`get_balance_service` directly from
  `groups_routes.py` (confirmed no circular import — `groups_routes.py` doesn't import `routes.py`)
  rather than redefining them, matching the existing DI pattern. Passes `settings.GROUPS_ENABLED`
  through explicitly rather than having `chat_service.py` re-read `Settings()` itself, so the flag
  check happens in exactly one place per request, consistent with `require_groups_enabled()`'s own
  "read fresh each call, don't cache" pattern elsewhere in the groups routes.
- **Fixed two existing tests that would have broken silently, not just left them red:**
  `test_analytics_api.py`'s `test_analysis_chat_with_item_intent`/`test_analysis_chat_with_merchant_intent`
  mocked `call_chat_model`'s return value as a bare string (`"Apples cost $2.00..."`); since the route
  now does `result.response`/`result.resolved_period`/`result.resolved_scope`, a bare-string mock
  would have raised `AttributeError` inside the route, not just failed an assertion. Updated both to
  return a real `ChatResult`, and added one assertion each confirming the new fields actually reach
  the HTTP response body — strengthening, not just patching, this ticket's own regression coverage.
- **The repo-root `test_chat_service.py`** (a manual, no-assertion smoke script requiring a real LLM
  — not part of the `tests/` pytest suite, confirmed by its lack of `assert`s/fixtures) had its final
  `print` statement updated to match the new `ChatResult` return shape, so a human running it
  manually doesn't see a confusing raw-dataclass dump where a plain string used to print.
- **New test file `tests/test_chat_period_scope_resolution.py`** (22 tests, all passing): every
  recognized phrase (parametrized), the unrecognized-phrase case, two explicit year/quarter
  boundary-crossing cases (a "last month"/"last quarter" query asked when "today" is January, to
  make sure the year rolls back correctly — a mid-year fixture alone would never exercise this),
  full `_resolve_chat_period` precedence (phrase > explicit > default, including a case where a
  phrase is present *alongside* an explicit param to confirm the phrase still wins), the
  current-month-default behavior change explicitly asserted (not just implied), scope resolution
  (match/no-match/generic-language/empty-groups), and two integration tests against a real seeded
  group via `GroupService`/`BalanceService` — one confirming the end-to-end resolve-then-fetch path
  produces a real (not just correctly-shaped) balance summary, one specifically constructed to prove
  the multi-tenant guard: a second, non-member user's own `list_groups_for_user` call is used to
  resolve scope, and correctly does **not** match the first user's group name.
- **Full backend suite verified green:** 133 passed, 4 skipped (pre-existing, Postgres-only e2e tests
  requiring Docker — unrelated to this change), 0 failed, after this ticket's changes.
- **Not done, out of this ticket's stated scope:** wiring the web/mobile AI Analyst chat client to
  read and render `resolved_period`/`resolved_scope` (that's `TS-DES-109`'s job, which currently
  ships with a documented placeholder pending this ticket landing — this ticket makes that
  placeholder replaceable with real data, it doesn't do the frontend wiring itself).
