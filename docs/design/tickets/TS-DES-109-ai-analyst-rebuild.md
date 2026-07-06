# TS-DES-109 — AI Analyst rebuild

**Initiative:** Reconcile UX Redesign · **Build order:** 4th (batch 2; most backend-gated ticket in this batch) · **Spec:** `UX_Design_Spec.md` §1.4/§4/§5/§6 ("chat is a layer, not a room"), `UX_Audit_and_Redesign.md` §3.5/§6, `docs/design/prototypes/AIAnalyst.jsx` · **Status:** 🔴 Not started

## Scope

Replace `varavu_selavu_ui/src/pages/AIAnalystPage.tsx`/`components/ai-analyst/AIAnalystChat.tsx`'s
current structure — a raw Provider/Model `Select` pair (exposing literal model IDs like
`gpt-5-mini`), a manual **Period** dropdown (Last 3 months/This month/This year/All time/Custom
range) that the user must set before asking anything, a static row of 4 suggested-prompt `Chip`s
below the input, and plain message bubbles with no scope indicator — with `AIAnalyst.jsx`'s
pattern: **no manual period/scope toggle at all**, a **Fast/Deep** picker replacing raw model
names, **suggested starter prompts** shown prominently before the first message (not a secondary
row under the input), and a **"Looked at: ..." chip** under each assistant answer, reflecting —
per-answer — what period and personal/group scope the system actually resolved for that specific
question.

## This is the most backend-gated ticket in this batch — read carefully before implementing

The chip and the "figure out the right period from what you ask" behavior are the entire premise
of this redesign, and neither is close to real today:

- **`POST /analysis/chat`'s `ChatRequest` model takes an explicit, pre-set `year`/`month`/
  `start_date`/`end_date`** (confirmed by reading `varavu_selavu_app/varavu_selavu_service/models/
  api_models.py`) — the client decides the scope and sends it; the AI does not infer it from the
  question text. This is the exact opposite of what the "Looked at: ..." chip implies (that the
  system read the question and resolved a scope). Today's manual Period dropdown is the only
  mechanism that exists.
- **`FEATURE_STATUS.md` marks TS-ANL-005 ✅ built — but not as intent-routing.** Its own §3 table is
  explicit: *"TS-ANL-005's 'intent routing' requirement was effectively superseded by a different
  architecture rather than implemented as specified"* — what shipped is a LangGraph ReAct
  tool-calling agent (`chat_service.py`, 3 tools: `get_expense_summary`/`get_item_insights`/
  `get_merchant_insights`) that the LLM calls as needed, not a component that outputs a structured
  `{period, scope}` resolution alongside its answer. Citing "depends on TS-ANL-005" without this
  nuance would be misleading — that ticket is done, just not in the form this redesign needs.
  **What's actually missing is net-new, unscoped backend work:** either the tool-calling agent needs
  to also emit a structured "what scope did I use" side-channel the client can render as the chip,
  or a new pre-processing step needs to resolve free-text → `{year, month, scope}` before the
  existing chat flow runs. Neither exists yet, and this ticket does not scope that work — it flags
  it precisely so whoever picks it up isn't stuck reverse-engineering what "TS-ANL-005 needs to be
  updated" actually means.
- Similarly, **group-scope resolution ("How much do I still owe in Weekend Trip?")** needs the chat
  agent to know about the user's groups at all — `chat_service.py`'s 3 tools are all
  personal-expense/item/merchant tools; there is no group-aware tool today. This is a second,
  separate backend gap from the period-inference one above, also unscoped here.

**Build the UI shell and chip pattern now regardless — this is standard practice for this
initiative** (TS-DES-106's lens switch and "Ask why" sheet took the same approach). The chip
renders with a **hardcoded/placeholder scope string** (e.g. always "This month · My Expenses",
or better, derived from whatever the existing manual controls would have produced, computed
client-side and mislabeled as "resolved" until the real thing exists — flag this exact spot in
code once built) until the backend work above lands.

## Files it will touch

- `varavu_selavu_ui/src/pages/AIAnalystPage.tsx` — likely thin, mostly unchanged (it's currently
  just a `Paper` wrapper around `AIAnalystChat`); confirm at implementation time whether it needs
  anything beyond passing through the same props.
- `varavu_selavu_ui/src/components/ai-analyst/AIAnalystChat.tsx` — the real rebuild:
  - Remove the Provider/Model `Select` pair; replace with a **Fast/Deep** pill picker (per
    `AIAnalyst.jsx`'s `MODELS`), mapping "Fast"/"Deep" to whichever underlying
    `provider`/`model` combination the app currently defaults to for speed vs. quality (check
    `getModels()`'s response shape and existing `ModelOption`s to decide a sensible default
    mapping — this ticket doesn't add new models, it relabels existing ones by behavior, per the
    Audit's own §3.5 quick-win: *"Name them by behavior ('Fast'/'Deep') if the picker stays"*).
  - Remove the manual Period `Select`/custom-date-range fields entirely — no replacement toggle;
    per the prototype, there is no user-set scope control at all.
  - Add suggested starter prompts as the pre-first-message empty state (matching
    `suggestedPrompts` styling — bordered rows, not chips), replacing/absorbing the existing
    `SUGGESTED_PROMPTS` chip row (which stays functionally similar — clickable canned questions —
    but changes position and visual treatment to lead the empty state instead of trailing the input).
  - Add the "Looked at: ..." chip under each assistant message, per the placeholder-data caveat
    above.
  - Keep: markdown-ish response formatting (`formatMarkdown`), the technical-error-message
    suppression logic, the `initialQuery` deep-link handling from Item/Merchant Insights' "Ask AI
    about this X" chips (must keep working — this is a real existing cross-link, not a placeholder).
- No backend/API-client file changes — `POST /analysis/chat`'s request shape is unchanged; this
  ticket removes the *client's* manual scope controls without asking the backend to infer anything
  it doesn't already do (the request will just stop sending an explicit period/scope, or send
  today's silent default — decide which at implementation time, and document it, since silently
  dropping the period param changes what data the AI actually sees vs. today's explicit selection).

## Acceptance criteria

- No raw model ID (e.g. `gpt-5-mini`) is ever shown in the UI — only "Fast"/"Deep".
- No manual period/date-range control exists anywhere in the chat UI.
- Starter prompts are shown prominently before the first message, not as a secondary chip row.
- Every assistant message shows a "Looked at: ..." chip — even though its value is a documented
  placeholder until the backend intent-resolution work (flagged above, not scoped here) lands.
- The existing "Ask AI about this item/merchant" deep-link (`?q=...` query param, auto-submitted)
  still works unchanged — this redesign doesn't regress that TS-ANL-007 cross-link.
- The existing technical-error-suppression behavior (hiding raw quota/429/500 messages behind a
  generic "temporarily unavailable" string) is preserved.
- Dark mode verified.
- This ticket's implementation notes (once built) must explicitly document: (a) what "Fast"/"Deep"
  actually map to under the hood, (b) exactly what the "Looked at: ..." chip's placeholder value is
  computed from, and (c) that group-scope questions ("how much do I owe in X group") will not
  resolve correctly today regardless of UI polish, since no group-aware tool exists in the chat
  agent — this is a real functional gap, not a coat of paint away from working.

## Dependencies

- **Hard UI dependency:** TS-DES-101 (tokens), `SegmentedTabs` (for the Fast/Deep picker, same
  component TS-DES-103/106 reuse).
- **Not blocking, but the reason this ticket's headline feature (the chip) is cosmetic-only:** a
  net-new backend capability — free-text period/scope intent resolution surfaced as structured
  data alongside the chat response, and a group-aware tool for the LangGraph agent. Neither is
  scoped by any existing ticket (TS-ANL-005 is done, just not in this shape) — flagging this as
  genuinely unscoped work for whoever picks it up next, not an "in-flight, will land soon" item.

## Test requirements

- No new Jest/pytest suites required as a gate, consistent with this initiative's approach.
- Manual verification: run the web app, confirm the Fast/Deep picker and starter prompts render and
  work, the "Looked at" chip renders on every assistant message (with its placeholder value clearly
  documented in code), the existing Item/Merchant Insights deep-link still auto-submits correctly,
  and dark mode holds up.
