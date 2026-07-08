# TS-GRP-120 — Recurring group expenses

**Phase:** 2 · **Spec:** §5.5, §6.2, §11.2, §12.1 · **Status:** 📋 Planned

## Scope

Extend the existing personal recurring-template system (`RecurringTemplate` / `RecurringService` / `/recurring/*` routes, all currently personal-only) to support templates that create a **group** expense on confirm, per spec §6.2: `recurring_templates` gains `group_id` + `split_config`.

The existing due/confirm/execute-now flow is reused, not replaced — `RecurringService.compute_due` / `mark_processed` operate on `user_email`-scoped templates already and don't need to know about groups; only the **confirm/execute-now write path** (currently hardcoded to `expense_service.add_expense`) needs a branch.

## Files it will touch

- **New:** Alembic migration adding `recurring_templates.group_id` (`UUID`, `ForeignKey("trackspense.groups.id")`, nullable) and `recurring_templates.split_config` (`JSON`, nullable) per §6.2.
- `varavu_selavu_app/varavu_selavu_service/db/models.py` — add the two columns to `RecurringTemplate` (`models.py:67-81`).
- `varavu_selavu_app/varavu_selavu_service/services/recurring_service.py` — `upsert_template` (`recurring_service.py:40-94`) gains optional `group_id`/`split_config` params; `list_templates` (`recurring_service.py:21-38`) includes them in the returned dict so the UI can show a group badge on the template card. **`compute_due`'s existing `RecurringTemplate.user_email == user_id` filter is fine unchanged** — a group template is still "owned" by whoever created it for due-computation purposes; only *confirmation* differs.
- `varavu_selavu_app/varavu_selavu_service/api/routes.py` — `confirm_recurring` (`routes.py:696-756`) and `execute_recurring_now` (`routes.py:758+`) both currently call `expense_service.add_expense(user_id=..., date=..., description=..., category=..., cost=..., merchant_name=...)` (`routes.py:744-751`) unconditionally. Branch: when the resolved template has a `group_id`, call `GroupExpenseService.create_expense(group_id=..., actor_email=user_id, ..., payers=[...], split_type=template.split_config["type"], split_entries=template.split_config.get("entries", []))` instead — building `payers` the same way the group-expense route does (single or multi-payer per the template's stored config), and running `analysis_service.invalidate_cache()` + `notification_service.fan_out(event_type="expense_added", ...)` exactly like `create_group_expense` does (`api/groups_routes.py:299-316`) so a confirmed recurring group bill triggers the same push notification as a manually-added one.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `UpsertRecurringTemplateRequest` (`api_models.py:278-286`) gains optional `group_id: Optional[str]` and `split_config: Optional[GroupSplitConfig]`; `RecurringTemplateDTO` (`api_models.py:266-276`) gains the same for read.
- **Web:** `varavu_selavu_ui/src/pages/RecurringPage.tsx`, `varavu_selavu_ui/src/components/recurring/RecurringCard.tsx` — template creation form gains a Personal/Group toggle (mirror `AddExpenseForm.tsx`'s pattern) + group picker + `SplitEditor`/`PayerPicker` (reuse **TS-GRP-116**'s components, don't fork new ones); card shows a group badge when `group_id` is set.
- **Mobile:** `varavu_selavu_mobile` doesn't appear to have a dedicated Recurring screen file yet in the group-aware pass — locate the existing recurring UI (likely `RecurringPrompt`-equivalent or a settings screen; grep `RecurringTemplate`/`recurring` under `varavu_selavu_mobile/src` before starting) and apply the same group toggle. Spec explicitly marks this `RecurringPrompt handles group recurring bills (P2)` at §12.1.
- `varavu_selavu_ui/src/components/expenses/RecurringPrompt.tsx` — the due-occurrence confirm dialog; when an occurrence's template is group-scoped, show which group/split it'll post to (read-only at confirm time — editing the split for a one-off occurrence is out of scope, use "execute now" + manual edit if needed).

## Acceptance criteria

- Creating a recurring template with `group_id` + `split_config` persists correctly; `GET /recurring/templates` returns it with the group fields intact.
- `POST /recurring/confirm` for a group-scoped due occurrence creates a proper group expense (with `expense_payers`/`expense_splits` rows, not a personal `Expense`), reuses the existing idempotency dedup key logic (`routes.py:711-718,733-737`) unchanged, and fires the standard `expense_added` push notification.
- `POST /recurring/execute_now` — same group branch.
- Existing personal-template flows are byte-identical (regression test).
- A group template whose group has since been deleted/archived (**TS-GRP-122**) should fail confirmation gracefully (e.g. skip with a logged warning, not a 500) — decide and document the exact behavior in this ticket's implementation, since the spec doesn't address it.

## Dependencies

- **TS-GRP-104** (`GroupExpenseService`), **TS-GRP-110** (notification fan-out pattern), optionally **TS-GRP-113/114** if the template's `split_config` uses shares/adjustment/multi-payer.

## Test requirements

- Extend `varavu_selavu_app/tests/` recurring test coverage (locate the existing recurring test file — grep `RecurringService` under `tests/` — and extend it) with: group-template creation, due-computation unaffected by `group_id`, confirm creates a real group expense with correct splits, idempotency (confirming twice doesn't double-post), execute-now group path.
