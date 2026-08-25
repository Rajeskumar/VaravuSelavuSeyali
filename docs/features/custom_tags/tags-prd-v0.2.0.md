# TrackSpense — Custom Tags (Phase 1)

> **Document Version:** 0.2.1
> **Status:** In progress — implementation started
> **Last Updated:** 2026-08-23
> **Owner:** Rajesh (Cerebroos)
> **Ticket Series:** `TS-TAG-1xx`
> **Feature Flag:** `TAGS_ENABLED`
> **Target Location:** `docs/engineering/TAGS_PRD.md`
> **Supersedes:** v0.1.0 (2026-08-19)

---

## 1. Summary

Add user-defined **tags** as a second, cross-cutting way to organize expenses, alongside the existing fixed category taxonomy. A tag is a free-form label the user creates once and reuses; an expense may carry several. Tags are private to the user who applies them, work across both personal expenses and the user's share of group expenses, and are consumed as a filter dimension across the existing Analysis and Expenses surfaces.

The differentiating requirement — and the reason this is worth building rather than copying — is **group-share awareness**. A tag total combines personal spend with the user's share of group spend. No competitor can produce that number.

---

## 2. Problem Statement

TrackSpense currently offers two ways to organize an expense, and neither answers a common question.

**Categories** (7 main / 44 sub, fixed) describe *what kind* of spend something is. They are a closed taxonomy, one per expense, shared across all users. They cannot express "this belongs to my Austin trip" or "I need to expense this to work."

**Groups** describe *who shares* the cost. They carry splitting, balances, and settle-up machinery. A group captures the shared Airbnb and the shared dinners on a trip — but not the taxi the user took alone, the souvenirs, the airport coffee, or the flight booked on their own card. A group also cannot exist without a counterparty, so a solo trip has nowhere to live.

The result: **TrackSpense has two grouping concepts that each answer half of "what did this trip actually cost me," and neither answers it fully.** Tags close that gap and are the natural place to express the unified-ledger thesis at the level of a single event or project.

Secondary use cases the same mechanism unlocks, all currently unserved:

- Reimbursables ("Work — expense report", "HSA reimbursable")
- Projects with a defined end ("Kitchen reno", "Move to Chicago")
- Tax-relevant spend ("Tax deductible 2026")
- Person-specific spend that cuts across categories ("Kids", "Mom")
- Follow-up flags ("Awaiting refund", "Check this")

---

## 3. Goals & Non-Goals

### Goals

| # | Goal |
|:--|:--|
| G1 | Users can create, apply, rename, archive, and delete their own tags |
| G2 | An expense can carry multiple tags; tag application is available at create, edit, and in bulk |
| G3 | Tag autocomplete surfaces the user's existing tags, ranked by recency and usage |
| G4 | Tag totals are **group-share-aware** — personal spend plus the user's share of group spend, in one number |
| G5 | Tags are usable as a filter on the Expenses list and across the existing Analysis surface |
| G6 | Retroactive tagging of a date range (the trip case) takes one action, not N |
| G7 | Tags on group expenses are **private to the tagger** and never visible to other group members |
| G8 | The AI Analyst can answer tag-scoped questions ("how much did Trip 1 cost me?") |

### Non-Goals (Phase 1)

- **A dedicated Tags analytics tab** — see §5.2. Retrieval in v1 is via filtering existing surfaces.
- Tag hierarchy or nesting — tags are flat, deliberately
- Per-tag budgets or spending targets
- Item-level tagging (tags apply to expenses, not `expense_items`)
- Shared / group-visible tags
- A general rules engine (merchant-based auto-tagging)
- Tag participation in Card Coach reward attribution
- Tag-aware receipt OCR

---

## 4. Positioning — Honest Framing

This is a **retention and depth feature for engaged users, not an acquisition feature.** Tags are table stakes in the personal-finance half of the market: Monarch and Copilot both ship them and both lead their documentation with the vacation use case. Shipping tags closes a parity gap; it does not by itself win a user away from either.

Splitwise has never shipped tags and has repeatedly declined custom categories; the community workaround is "create another group." That friction is real and TrackSpense can relieve it — but Splitwise users don't churn over it.

**Do not market tags as a headline feature.** The headline remains the unified ledger. Tags are the mechanism that makes the unified ledger legible at event scale, and that framing ("what did this trip cost me, all in") is the only part of this feature worth putting in front of a prospective user.

### 4.1 Groups dependency — resolved

v0.1.0 flagged the risk that the differentiating half of this feature depends on Groups being shipped and correct. **That risk is closed.** Groups is live in production with `GROUPS_ENABLED` permanently true (flag removal is a separate cleanup task), so the group-share-aware tag total is available from day one rather than contingent on a future release.

One residual note, scoped correctly: the known Balances side-panel inversion is a **presentation defect in a single component** — the Balances tab and the Settle-Up modal compute and display shares correctly. Tag analytics consume the share-computation path, not the panel, and therefore inherit a sound calculation. Tags are not blocked on that fix.

**Requirement carried forward:** tag totals must call the *existing* share-computation path rather than reimplementing it, so that any future correction to share logic propagates automatically.

### 4.2 Primary adoption risk

Tagging is voluntary manual work layered on an app that already requires manual entry. Industry pattern is low single-digit adoption unless application is nearly free. The ROI of this feature is determined by **G6 (bulk/date-range apply)** and **G5/G8 (retrieval surfaces)**, not by the tag data model.

**A version that ships the data model and a chip input, without bulk apply and without a working tag filter, is dead weight and should not be built.**

---

## 5. Conceptual Model & Scope Doctrine

### 5.1 Three organizing concepts

| Concept | Answers | Cardinality | Ownership | Machinery |
|:--|:--|:--|:--|:--|
| **Category** | What kind of spend is this? | Exactly one, fixed taxonomy | System-defined | Analysis, Card Coach, categorization AI |
| **Group** | Who shares this cost? | Zero or one | Shared with members | Splitting, balances, settle-up |
| **Tag** | Why / for what / when? | Zero to many, user-defined | Private to the user | Filtering, totals. **No settlement.** |

**UI copy rule:** never describe a tag as a "custom category." It is not a category — it is a second, orthogonal axis. Suggested microcopy on the tag input: *"Group expenses across categories — a trip, a project, anything."*

### 5.2 Retrieval strategy — filter first, dedicated surface later

v0.1.0 specified a dedicated Analysis → Tags sub-tab. **That is deferred to Phase 2.**

Rationale: once `GET /analysis?tag_ids=` works, a user selecting a tag filter already gets totals, category breakdown, merchant breakdown, and the scoped expense list — through the Analysis page they already know. The dedicated sub-tab was the largest UI ticket in the spec and it delivers a *discovery surface*, not a capability. It is the correct reward for adoption showing up, not a bet placed before it does.

**Consequence for v1:** the tag filter chip on Analysis and Expenses is no longer a nice-to-have — it is the *only* retrieval path and must be prominent and discoverable. The scoped total displayed while a tag filter is active must be the group-share-aware **My Expenses** figure (G4), with **I Paid** shown as a secondary line. This is where the differentiating number lives in v1.

---

## 6. User Stories

1. As a user adding an expense, I can type a tag name and either pick an existing tag from autocomplete or create a new one inline, without leaving the form.
2. As a user returning from a trip, I can select a date range and apply a tag to every expense in it — including my share of the trip group's expenses — in one action.
3. As a user, I can filter Analysis to one tag and see what it cost me in total, split between what I paid and what my share was, broken down by category and merchant.
4. As a member of a group, I can tag a shared dinner "Work — reimbursable" and be confident no other member of that group can see that label.
5. As a user, I can filter my Expenses list to one or more tags and see the filtered total.
6. As a user, I can archive a tag when a trip or project ends, so it stops cluttering autocomplete while its history stays intact.
7. As a user, I can ask the AI Analyst "how much did Trip 1 cost me?" and get a correct, scope-transparent answer.

---

## 7. UX Specification

### 7.1 Tag input (`TagInput`)

A chip-based multi-select with typeahead, used everywhere an expense is created or edited.

- Empty state: a subtle "＋ Add tag" affordance, not a prominent field. Tags are optional and must not add perceived friction to the primary add-expense flow.
- Typing filters the user's active tags; ranking is most-recently-used, then most-used (both derived — see §8.1).
- **Near-duplicate guard (§9.1):** if the typed string fuzzy-matches an existing tag above threshold, surface it as a highlighted suggestion — *"Did you mean **Trip 1**?"* — above the create row. The user may still create the new tag.
- No match → an explicit "Create *«name»*" row at the bottom of the dropdown. Creation is inline; no separate management step required.
- Applied tags render as removable chips using the tag's color.
- Enforces `TAG_MAX_PER_EXPENSE` (default 5) with a clear message at the limit.

**Placement (web):** the add/edit expense modal, the group add-expense modal, the expense detail/edit view.
**Placement (mobile):** `AddExpenseScreen`, expense edit. See §11.2 for the scope note.

> ⚠️ **Coupling:** the app currently has three distinct add-expense forms with two different category paradigms. Adding `TagInput` to all three multiplies existing UI debt. See §11.1.

### 7.2 Bulk tagging (Expenses list)

- A "Select" mode toggle on the Expenses list enables row checkboxes.
- With ≥1 row selected, an action bar appears: **Tag**, **Untag**, **Clear selection**, with a running count and selected total.
- **Tag** opens the same `TagInput` popover; applying writes to all selected expenses.

### 7.3 Date-range apply ("Tag a trip")

The primary path for G6, reachable from the bulk action bar and from the tag management view.

- Dialog fields: **Tag**, **From date**, **To date**, and optional narrowing filters — **Group**, **Category**, **Merchant**.
- Shows a **live preview count and total** before applying ("Will tag 34 expenses · $1,284.50 my share"). This is a dry-run against the same endpoint.
- Applying is idempotent — expenses already carrying the tag are skipped, not duplicated.
- The **Group** filter is what makes "absorb my trip group into this tag" a single action.

### 7.4 Filtering — the primary retrieval surface

- **Expenses list:** multi-select tag filter (OR semantics within tags, AND against other active filters). Filtered total displayed.
- **Analysis:** tag filter chip in the existing filter bar, applying to Overview, Items, and Merchants sub-tabs. When active, the header total shows **My Expenses** (group-share-aware) with **I Paid** as a secondary line, and a visible indication that the view is tag-scoped.

### 7.5 Tag management

A section under Account/Settings: list all tags (active and archived), with rename, recolor, archive/unarchive, delete, per-tag usage count, and an entry point to §7.3. Delete requires a confirmation stating how many expenses will lose the tag.

### 7.6 Starter tags

On first tag-surface visit, seed a small set of suggestions rather than pre-creating rows: `Reimbursable`, `Tax deductible`, `Trip`, `Gift`. Presented as one-tap creation chips in the empty state. Solves cold-start without polluting the user's tag list.

---

## 8. Data Model

Two new tables in the `trackspense` schema. No changes to `expenses`.

```sql
CREATE TABLE IF NOT EXISTS trackspense.tags (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email       VARCHAR(255) NOT NULL
                     REFERENCES trackspense.users(email) ON DELETE CASCADE,
    name             VARCHAR(50)  NOT NULL,   -- display name, user's original casing
    normalized_name  VARCHAR(50)  NOT NULL,   -- dedupe key, see §9.1
    color            VARCHAR(7),              -- hex; null = assigned from palette
    status           VARCHAR(20)  NOT NULL DEFAULT 'Active',  -- Active | Archived
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_tags_user_normalized UNIQUE (user_email, normalized_name)
);

CREATE TABLE IF NOT EXISTS trackspense.expense_tags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id       UUID NOT NULL REFERENCES trackspense.tags(id)      ON DELETE CASCADE,
    expense_id   UUID NOT NULL REFERENCES trackspense.expenses(id)  ON DELETE CASCADE,
    user_email   VARCHAR(255) NOT NULL,   -- the TAGGER, denormalized from tags.user_email
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_expense_tags UNIQUE (tag_id, expense_id)
);

CREATE INDEX idx_tags_user_status     ON trackspense.tags (user_email, status);
CREATE INDEX idx_expense_tags_expense ON trackspense.expense_tags (expense_id);
CREATE INDEX idx_expense_tags_tag     ON trackspense.expense_tags (tag_id);
CREATE INDEX idx_expense_tags_user    ON trackspense.expense_tags (user_email);
```

**Why `user_email` is denormalized onto `expense_tags`:** it is derivable from `tag_id`, but carrying it on the link row makes row-level isolation enforceable in a single predicate on every read path, without a join. Given that this column is the mechanism protecting G7, the redundancy is deliberate.

### 8.1 Usage stats are derived, not stored

v0.1.0 carried `usage_count` and `last_used_at` columns on `tags`. **Removed.** With tags capped at 100 per user, both are cheap to derive from `expense_tags` (`COUNT(*)` and `MAX(created_at)` grouped by `tag_id`) in the same query that powers autocomplete. Storing them would require correct maintenance across four mutation paths (apply, remove, bulk apply, bulk remove) with drift risk and no measurable benefit.

The autocomplete endpoint computes ranking in one grouped query over the user's link rows.

---

## 9. Business Rules

### 9.1 Normalization & uniqueness — revised

**`normalized_name` = lowercase → trim → collapse internal whitespace runs to a single space.** Nothing else.

Worked example: `"Trip 1"`, `"trip 1"`, and `"  TRIP  1 "` all normalize to `trip 1` and are the same tag. `"Trip1"` and `"Trip-1"` normalize to `trip1` and `trip-1` and are **distinct** tags.

> **Change from v0.1.0.** The prior spec stripped all non-alphanumerics and spaces so that `"Trip 1"` and `"Trip1"` collapsed into one tag. That was the wrong call: it applies an **irreversible data constraint to solve a UI problem**, and it silently merges tags a user may have meant to keep separate, with no undo once merged.
>
> The near-duplicate problem is real but belongs at *suggestion* time, not at *storage* time — see §7.1. A wrong hint is recoverable; a wrong merge is not.

**Fuzzy matching implementation:** client-side over the user's tag list (≤100 entries), using normalized Levenshtein distance with a threshold tuned to catch case/spacing/punctuation variants and simple typos. No `pg_trgm` dependency, no extra round trip.

Attempting to create a tag whose `normalized_name` already exists for that user returns the **existing** tag with HTTP 200 rather than erroring. Inline creation must never fail on an exact-normalized duplicate.

### 9.2 Privacy (G7 — load-bearing)

- A tag belongs to exactly one user. There is no shared tag.
- Tagging a group expense creates a link row owned by the tagger only.
- **Every read path that returns tags for an expense MUST filter `expense_tags.user_email = <current user>`.** Group expense detail, group expense list, group activity feed, and any group export are all in scope.
- This is the one decision in this document that is expensive to retrofit. It must be enforced in the **repository layer, not the route layer**, and covered by an explicit test asserting that user B cannot see user A's tags on a shared expense.

### 9.3 Limits

| Rule | Value | Config |
|:--|:--|:--|
| Max tags per expense | 5 | `TAG_MAX_PER_EXPENSE` |
| Max active tags per user | 100 | `TAG_MAX_PER_USER` |
| Tag name length | 1–50 chars after trim | — |
| Max expenses per bulk apply | 1000 | `TAG_BULK_MAX` |

### 9.4 Lifecycle

- **Rename** changes `name` and recomputes `normalized_name`; link rows are untouched. Rejected if the new normalized name collides with another of the user's tags.
- **Archive** removes the tag from autocomplete and from the default management list. It remains applied, remains filterable, and still appears when explicitly selected. Archiving is the expected end-of-trip action.
- **Delete** removes the tag and cascades its links. Requires confirmation stating the affected expense count. Not reversible.
- Deleting an expense cascades its links. Deleting a user cascades everything.

### 9.5 Group lifecycle interaction — revised in v0.2.1, both scenarios verified against the real Groups implementation while building TS-TAG-103

- **Member leaves a group:** historical expenses and computed shares persist, so tag links persist. No action needed. **Confirmed** — `expense_tags` has no FK to `group_members`, and removing a member is a `GroupMember` row deletion that never touches `Expense`/`ExpenseTag` at all (verified by `test_member_leaving_group_does_not_cascade_delete_their_tag_links`).
- **Group is deleted:** ~~its expenses cascade away, taking their tag links with them~~ — **this assumption was wrong.** `GroupService.delete_group` is a **soft delete** (`status='deleted'`, `deleted_at` set) — the `Group` row is never actually removed, so no FK cascade ever fires on `Expense` or `ExpenseTag`. `list_group_expenses` (the read path both the UI and TS-TAG-103's association endpoints go through) calls `require_membership`, which checks `GroupMember` status only, never `Group.status` — so a "deleted" group's tagged expenses remain fully intact and visible through the *exact same path* as before deletion (verified by `test_deleting_a_group_does_not_actually_cascade_anything`). **There is no cascade, so the confirmation-dialog requirement below doesn't correspond to real data loss today and is dropped.** (One real, narrower effect: `AnalysisService`'s group-summary aggregates filter `Group.status == "active"`, so a deleted group's spend already drops out of *that* specific query — worth knowing if TS-TAG-106's tag-scoped totals end up composing on top of it, but that's a detail for that ticket, not a lifecycle hazard for this one.)

### 9.6 Group-share arithmetic

Tag-scoped totals reuse the existing money-view model:

- **My Expenses** = personal expense amounts + the user's computed share of tagged group expenses. Primary reported figure.
- **I Paid** = the full amount the user actually paid out, including amounts fronted for others.
- **Group Total is not reported at tag level** — consistent with the earlier decision to drop that lens as conceptually unsound.

Per §4.1, this must call the existing share-computation path, not reimplement it.

---

## 10. API Specification

All under `/api/v1`, all authenticated, all scoped to the token's user.

### 10.1 Tag CRUD

| Method | Path | Description |
|:--|:--|:--|
| `GET` | `/tags?q=&status=active&limit=20` | List / autocomplete. Ranked most-recently-used, then most-used (derived, §8.1). |
| `POST` | `/tags` | Create `{name, color?}`. Returns existing tag on normalized collision. |
| `PUT` | `/tags/{tag_id}` | Update `{name?, color?, status?}` |
| `DELETE` | `/tags/{tag_id}` | Delete tag + cascade links |

### 10.2 Association

| Method | Path | Description |
|:--|:--|:--|
| `POST` | `/expenses/{expense_id}/tags` | Apply `{tag_ids?: [], tag_names?: []}`. Names are created-or-resolved. Idempotent. |
| `DELETE` | `/expenses/{expense_id}/tags/{tag_id}` | Remove one tag from one expense |

`POST /expenses`, `PUT /expenses/{row_id}`, and `POST /expenses/with_items` gain an optional `tag_names: string[]`. On `PUT`, an omitted field leaves tags unchanged; an explicit empty array clears them.

All expense read paths gain a `tags: [{id, name, color}]` field per row, filtered to the current user.

### 10.3 Bulk operations

| Method | Path | Description |
|:--|:--|:--|
| `POST` | `/tags/bulk_apply` | See below |
| `POST` | `/tags/bulk_remove` | Same shape, removes |

```jsonc
// POST /tags/bulk_apply
{
  "tag_id": "uuid",            // or "tag_name": "Trip 1"
  "expense_ids": ["uuid"],     // EITHER an explicit list...
  "filter": {                  // ...OR a filter (mutually exclusive)
    "start_date": "2026-07-04",
    "end_date":   "2026-07-11",
    "group_id":   "uuid | null",
    "category":   "string | null",
    "merchant_name": "string | null"
  },
  "dry_run": true
}

// Response
{
  "matched_count": 34,
  "already_tagged_count": 2,
  "applied_count": 0,          // 0 when dry_run
  "my_expenses_total": 1284.50,
  "i_paid_total": 1620.00
}
```

### 10.4 Tag-scoped filtering

`GET /analysis` and `GET /expenses` gain an optional `tag_ids` query param (repeatable, OR semantics). The `/analysis` response, when tag-filtered, returns share-aware `my_expenses_total` and `i_paid_total` alongside existing fields.

> Dedicated `/analytics/tags` endpoints are **deferred to Phase 2** with the Tags sub-tab (§5.2).

### 10.5 Aggregation strategy — deliberate deviation

**Tag-scoped analytics are computed at query time, not pre-calculated at save time.** This differs from Item Insights and Merchant Insights, which use the save-time background pipeline. Rationale:

1. Tag cardinality per user is low (capped at 100) — aggregation is cheap.
2. Tags mutate in bulk. A 1000-expense bulk apply would trigger 1000 aggregate updates under the save-time model, and bulk *remove* would need reversal logic the existing pipeline does not have.
3. The existing 60-second `ANALYSIS_CACHE_TTL_SEC` cache already covers the read pattern.

**Requirement:** all tag mutations must invalidate the analysis cache for that user, or the filtered view will serve stale totals immediately after a bulk apply — the single most likely first-use moment.

---

## 11. Dependencies & Sequencing

### 11.1 Soft dependency — add-expense form unification

The design review's P2 item #6 (unify the three add-expense forms) is not a blocker but is a **strong cost multiplier**. Building `TagInput` before unification means three web implementations plus mobile; after unification, roughly one plus mobile. Recommend sequencing tags *after* or *jointly with* form unification.

### 11.2 Mobile scope note

`TS-TAG-112` is larger than a port. There is no MUI on React Native — the chip-plus-typeahead input is a custom component with its own keyboard, focus, and layout behavior. **v1 mobile scope is deliberately reduced** to applying and removing existing tags plus the tag filter. Tag creation, management, and bulk apply stay web-only in v1; the retroactive bulk path is a desktop-shaped action anyway.

### 11.3 AI Analyst prerequisite — resolved

*(Resolved 2026-08-23 — v0.2.0 flagged this as outstanding based on a stale `FEATURE_STATUS.md` read.)* Verified directly against `chat_service.py`: `build_rag_context()` is wired into `call_chat_model()` and TS-ANL-005 is shipped. The LangGraph tool-calling agent is healthy — `TS-TAG-113` has no blocking dependency and moves to core v1 scope (§12). It implements G8, which §4.2 names alongside G5/G6 as one of the goals this feature's ROI is actually measured against, so treating it as conditional understated its priority.

### 11.4 Recommended backlog position

Behind:
- **Group Balances panel inversion** — a correctness defect that actively misinforms users about who owes whom outranks any new feature.
- **Card Coach Phase 1** — already in flight, already specced.

Roughly level with:
- Add-expense form unification (coupled anyway).

### 11.5 Card Coach interaction

None in Phase 1. Card Coach operates on category and merchant; tags are orthogonal. Explicitly out of scope to avoid scope creep in either spec.

---

## 12. Ticket Breakdown (`TS-TAG-1xx`)

One ticket per PR, per convention. Numbering preserved from v0.1.0 so existing references stay valid; deferred tickets retain their numbers.

### Core — v1 (12 tickets)

| Ticket | Title | Scope | Depends on |
|:--|:--|:--|:--|
| **TS-TAG-101** | Data model & migrations | `tags` + `expense_tags`, indexes, ORM models, `schema.sql`, normalization utility + unit tests | — |
| **TS-TAG-102** | Tag CRUD service & API | `TagService`, `/tags` endpoints, derived-ranking autocomplete query, limits, rename-collision handling, archive semantics | 101 |
| **TS-TAG-103** | Association API & read-path integration | `/expenses/{id}/tags`, `tags[]` on all expense read paths, **user-scoped filtering in repo layer + cross-user isolation test**, §9.5 member-leave verification | 102 |
| **TS-TAG-104** | Tag write-through on expense create/update | `tag_names` on `POST /expenses`, `PUT /expenses/{row_id}`, `POST /expenses/with_items` | 103 |
| **TS-TAG-105** | Bulk apply/remove API | `/tags/bulk_apply`, `/tags/bulk_remove`, dry-run, filter-based selection incl. `group_id`, idempotency, `TAG_BULK_MAX` | 103 |
| **TS-TAG-106** | Tag-scoped filtering & share-aware totals | `tag_ids` on `/analysis` and `/expenses`, share-aware `my_expenses_total` / `i_paid_total` via existing share path, cache invalidation | 103 |
| **TS-TAG-107** | Web: `TagInput` component | Chip multi-select, typeahead, fuzzy near-duplicate suggestion, inline create, limit handling; integrated into add/edit expense modal(s) — see §11.1, the edit path is still ~3 separate implementations even after Quick Capture unified creation | 104 |
| **TS-TAG-108** | Web: bulk tagging on Expenses list | Select mode, action bar, bulk tag/untag popover | 105, 107 |
| **TS-TAG-109** | Web: date-range apply dialog | Filters, live dry-run preview count/total, apply | 105, 107 |
| **TS-TAG-111** | Web: tag filter + management | **Primary retrieval surface (§5.2)** — tag filter on Expenses and Analysis with share-aware scoped total; tag management under Account | 106, 107 |
| **TS-TAG-113** | AI Analyst tag integration | Unconditional as of §11.3 — TS-ANL-005 confirmed shipped. Implements G8. Scope footnote must name the tag: *"Looked at: Trip 1 · My Expenses"* | 106 |
| **TS-TAG-115** | Feature flag, starter tags, telemetry | `TAGS_ENABLED` gating across web/mobile/API, starter-tag empty state, adoption events | all |

### Conditional — v1 if prerequisites hold (1 ticket)

| Ticket | Title | Condition |
|:--|:--|:--|
| **TS-TAG-112** | Mobile: apply/remove + tag filter | Reduced scope per §11.2. Ship after web lands; not a launch blocker. |

### Deferred to Phase 2

| Ticket | Title | Reason |
|:--|:--|:--|
| **TS-TAG-110** | Analysis → Tags sub-tab + `/analytics/tags` endpoints | §5.2 — discovery surface, not a capability. Gate on adoption. |
| **TS-TAG-114** | Active-window tag suggestion | Convenience; `window_start`/`window_end` columns dropped from v1 schema. |
| **TS-TAG-116** | Mobile: tag creation, management, bulk apply | §11.2 |

**Minimum shippable set: 101–109, 111, 113, 115.** Shipping 101–107 alone (model + input, no bulk, no filter) delivers a field nobody fills in — see §4.2. TS-TAG-113 is included in the floor because it implements G8, named alongside G5/G6 as one of the goals this feature's ROI is measured against (§4.2) — not because AI integration is normally load-bearing for a v1.

---

## 13. Success Criteria

*(Revised in v0.2.0 — the numeric targets in v0.1.0 were invented and would be statistical noise at current user volume.)*

**Gate 1 — dogfood.** On the next real trip or project, is the flow actually used end to end: create tag → bulk apply by date range → filter Analysis → get a number that looks right? If the bulk apply is skipped in favour of manual tagging, §7.3 has failed and needs rework before wider release.

**Gate 2 — first cohort.** Among the first ~20 active users after launch, qualitatively:
- Does anyone create a tag unprompted?
- Do any tagged expenses include group shares? (Direct evidence the differentiating case is exercised — worth an explicit event.)
- Do tags get used as intended, or as a second category taxonomy? (High tag counts with category-like names — "Groceries", "Fuel" — means the §5.1 doctrine failed to land in the UI copy.)

**Instrumented events (TS-TAG-115):** tag created, tag applied (with `is_group_expense` flag), bulk apply used, date-range apply used, tag filter used, tag-scoped AI query.

**Stop rule.** If after a full quarter tags are unused outside dogfooding, leave the feature in place and invest nothing further — no Phase 2, no sub-tab, no rules engine.

---

## 14. Open Questions

1. **Recurring templates and default tags.** Should a recurring template carry default tags applied on execution? Cheap (one column + one field) but adds a fourth surface to `TagInput`. *Recommendation: defer to Phase 2.*
2. **Archived tags in filter dropdowns.** Trips end but their totals stay interesting. *Recommendation: exclude by default with a "Show archived" toggle.*
3. **Tag color assignment.** User-picked, or auto-assigned from a fixed palette with optional override? *Recommendation: auto-assign, override in management view — fewer decisions at creation time.*
4. **Fuzzy-match threshold (§9.1).** Needs tuning against real tag names. Too tight and it never fires; too loose and it nags on every distinct tag. *Recommendation: start conservative, adjust after Gate 1.*
5. **Group detail "tag all my shares in this group."** This is TS-TAG-105's `group_id` filter surfaced in a second place. Low cost, high discoverability for the trip case. *Recommendation: yes, if TS-TAG-109 lands cleanly.*

---

## 15. Phase 2 Candidates (Not Committed)

Gated on §13.

- **TS-TAG-110** — Analysis → Tags sub-tab and `/analytics/tags` endpoints
- **TS-TAG-116** — Mobile tag creation, management, bulk apply
- **TS-TAG-114** — Active-window tag suggestion
- Merchant/description-based auto-tag rules ("anything from Delta → `Travel`")
- Recurring template default tags
- Per-tag budgets or spending targets
- Tag-scoped CSV export (the reimbursement and tax workflows)
- AI-suggested tags at save time, reusing `CategorizationService`
- Item-level tags

---

## Change Log

**v0.2.1 (2026-08-23–24)**
- §11.3, §12 — TS-ANL-005 confirmed shipped (verified directly against `chat_service.py`: `build_rag_context()` is wired into `call_chat_model()`). TS-TAG-113's blocking condition is resolved; moved from "Conditional" to core v1 scope and into the minimum shippable set, since it implements G8.
- §12 — Core ticket count 11 → 12; conditional count 2 → 1 (TS-TAG-112 remains conditional on web landing first).
- §9.5 — **Group-deletion cascade assumption corrected.** Built and verified against the real `GroupService.delete_group` (a soft delete, `status='deleted'`) while implementing TS-TAG-103: there is no FK cascade on group "deletion," so tagged group expenses are never actually removed, and the confirmation-dialog requirement this assumption drove is dropped. The member-leaves-a-group half of §9.5 was independently confirmed correct as originally written.
- TS-TAG-101, 102, 103 implemented: schema/migrations, `TagService` CRUD + derived-ranking autocomplete, association API (`POST`/`DELETE /expenses/{id}/tags`) and `tags[]` on personal + group expense read paths, with the PRD §9.2 cross-user isolation guarantee covered by an explicit test.

**v0.2.0 (2026-08-22)**
- §4.1 — Groups confirmed live in production; the v0.1.0 dependency risk is closed. Balance-panel inversion correctly scoped as a presentation defect that does not affect share computation.
- §5.2, §12 — Dedicated Tags analytics tab (TS-TAG-110) deferred to Phase 2; tag filtering promoted to primary retrieval surface. Ticket count reduced 15 → 11 core.
- §8.1 — `usage_count` / `last_used_at` columns removed; stats derived from `expense_tags`.
- §9.1 — **Normalization reversed.** Aggressive space/punctuation stripping replaced with case-and-whitespace-only normalization plus client-side fuzzy suggestion at input time.
- §9.5 — New: group deletion and member-leave interaction with tag links.
- §11.2 — Mobile scope reduced and de-risked; §11.3 — TS-ANL-005 prerequisite called out for TS-TAG-113.
- §13 — Invented numeric targets replaced with qualitative dogfood and first-cohort gates.
- §8 — `window_start` / `window_end` columns dropped from v1 schema (moved with TS-TAG-114).

**v0.1.0 (2026-08-19)** — initial draft.
