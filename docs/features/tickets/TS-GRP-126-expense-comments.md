# TS-GRP-126 — Expense comments

**Phase:** 3 · **Spec:** §5.2 · **Status:** 📋 Planned

## Scope

Threaded comments per group expense (spec §5.2: "Expense comments | Threaded comments per expense"). New table, new endpoints, web/mobile UI, and integration with the existing activity feed + push notifications.

## Files it will touch

- **New:** Alembic migration + ORM model `ExpenseComment` (`id`, `expense_id` FK → `expenses.id` `ondelete=CASCADE`, `member_id` FK → `group_members.id` (author), `body: Text`, `created_at`, `edited_at: Optional[DateTime]`). "Threaded" — confirm with product whether this means simple flat chronological comments per expense (Splitwise's actual model) or true reply-to-comment threading; **recommend flat chronological** (matches Splitwise, §2.1's competitive baseline, and avoids unbounded UI complexity) unless the spec author intended literal threading — flag this as a scope decision to confirm before implementation, don't guess silently.
- `varavu_selavu_app/varavu_selavu_service/db/models.py` — new `ExpenseComment` class.
- **New:** `services/expense_comment_service.py` — `list_comments(group_id, expense_id, actor_email)` (membership-gated), `add_comment(group_id, expense_id, actor_email, body)`, `delete_comment(group_id, expense_id, comment_id, actor_email)` (author-only, or any-member-can-delete matching the existing any-member-can-edit-expense precedent from §17.2 — recommend **author-only** for comments specifically, since deleting someone else's comment is a different trust surface than editing a shared expense's numbers; note this as a deliberate divergence from the expense-edit policy, not an oversight).
- `varavu_selavu_app/varavu_selavu_service/api/groups_routes.py` — `GET/POST /{group_id}/expenses/{expense_id}/comments`, `DELETE /{group_id}/expenses/{expense_id}/comments/{comment_id}`.
- `varavu_selavu_app/varavu_selavu_service/models/api_models.py` — `ExpenseCommentDTO`, `AddCommentRequest`.
- Activity feed integration (**TS-GRP-119**): log a `comment_added` activity row (extend that ticket's action vocabulary).
- Push notification integration (**TS-GRP-110**/`NotificationService`): fan out a `comment_added` event to all group members except the author, respecting **TS-GRP-125**'s mute preferences if that ticket has landed.
- **Web:** new `varavu_selavu_ui/src/components/groups/ExpenseComments.tsx`, mounted in the group expense detail/edit dialog on `GroupDetailPage.tsx`.
- **Mobile:** new `varavu_selavu_mobile/src/components/ExpenseComments.tsx`, mounted in `GroupDetailScreen.tsx`'s expense detail view.

## Acceptance criteria

- Any group member can add/view comments on any group expense in that group; non-members → `403`.
- Comment author can delete their own comment; a non-author member attempting to delete another's comment → `403`.
- Comments cascade-delete when the parent expense is deleted (FK `ondelete=CASCADE`).
- New comment triggers a push notification to other members (and an activity feed entry) — verify both fire exactly once per comment.
- Comments never affect balances/analytics (they're not expense data) — trivial to satisfy given the separate table, but worth an explicit regression test given how central that separation is to this whole feature (§3.2 Rule TS-GRP-R2's spirit, even though that rule is about settlements specifically).

## Dependencies

- **TS-GRP-104** (group expenses to comment on), **TS-GRP-110** (notification fan-out), **TS-GRP-119** (activity feed, for the `comment_added` entry — can land before 119 with the activity write stubbed/deferred if sequencing requires).

## Test requirements

- New `varavu_selavu_app/tests/test_expense_comments.py`: add/list/delete happy paths, non-member `403`, non-author-delete `403`, cascade-delete-on-parent-expense-delete, notification fan-out triggered, balances/analytics unaffected by comment activity.
