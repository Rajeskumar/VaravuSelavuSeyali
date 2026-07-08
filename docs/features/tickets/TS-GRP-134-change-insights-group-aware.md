# TS-GRP-134 — Change Insights: group-aware copy

**Phase:** 3 · **Spec:** §5.4, §9.2 · **Status:** 📋 Planned

## Scope

§9.2: "Change Insights (TS-ANL-004): operates on the combined ledger; card copy must state scope ('your share of…')." `InsightAnalyticsService.calculate_change_insights` (`services/insight_analytics_service.py:673+`) is the existing TS-ANL-004 implementation (7 insight types, already shipped per FEATURE_STATUS.md: category jumps, merchant increases, unusual large transactions, recurring bill increases, etc.). Once **TS-GRP-106** made `/analysis` scope-aware (`scope=combined` includes group shares) and **TS-GRP-123** feeds merchant/item insights from group shares, `calculate_change_insights` will start silently blending personal and group-share amounts into its category/merchant totals without the UI ever disclosing that blend — this ticket closes that disclosure gap.

## Files it will touch

- `varavu_selavu_app/varavu_selavu_service/services/insight_analytics_service.py` — `calculate_change_insights` (`insight_analytics_service.py:673+`) currently builds insight cards from personal-only aggregates (pre-Groups). Audit each of the 7 insight types (category jump, merchant increase, unusual large transaction, recurring bill increase, and the others per FEATURE_STATUS §2's TS-ANL-004 entry) for whether their underlying query already picked up group shares transparently (via **TS-GRP-106**'s `scope=combined` guard) or needs an explicit group-share leg added (via **TS-GRP-123**'s per-member insight rows). For each insight that includes group-derived spend, append scope-disclosing copy: e.g. "Your share of Apartment 4B utilities rose 18% this month" (the spec's own example, §5.4) instead of a bare "Utilities rose 18%" that doesn't disclose it's blending in a roommate-split bill.
- Card metadata: add a `group_id`/`group_name` field to whichever insight-card response model backs Change Insights (locate it in `models/api_models.py` — likely near the existing insight response models) when an insight is group-attributable, so the web/mobile card can render a group badge/chip consistent with how group expense rows already show one elsewhere in the app.
- **Web:** the Change Insights card component (locate under `varavu_selavu_ui/src/components` — check the existing Analysis page's "What Changed" rail, `WhatChangedRail`/`WhatChangedCallout` per `docs/design/tickets/TS-DES-106`/`TS-DES-108`) — render the group badge/scope-disclosing copy when present.
- **Mobile:** equivalent card component, currently noted in FEATURE_STATUS.md as not yet ported to mobile for the broader Insights work — coordinate scope with whoever picks up that pre-existing mobile-parity gap rather than duplicating it here; this ticket only needs to not make that gap worse (i.e., write the copy/data model changes in a way mobile can consume once it catches up).

## Acceptance criteria

- Any Change Insight whose underlying spend includes a group share states so explicitly in its copy ("your share of X"), never presenting a blended personal+group number as if it were purely personal.
- A personal-only insight (no group involvement) is completely unchanged — this ticket must not alter copy or behavior for users with no groups, or for insights that happen to be 100% personal.
- Insight ranking (already "ranked by relative magnitude, not insertion order" per FEATURE_STATUS) is unaffected by this change — it's a copy/disclosure layer, not a ranking change.

## Dependencies

- **TS-GRP-106** (scope-aware analysis), **TS-GRP-123** (group-share-fed merchant/item insights) — this ticket cannot correctly audit which insights need disclosure until both have landed.

## Test requirements

- Extend whatever existing Change Insights test file covers TS-ANL-004 (locate via the FEATURE_STATUS.md reference — likely in `varavu_selavu_app/tests/`) with: a group-derived insight includes scope-disclosing copy and a group badge field; a personal-only insight is byte-identical to pre-ticket output.
