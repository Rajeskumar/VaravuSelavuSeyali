# TS-GRP-146: Share-link group invitation — PROPOSAL, not a build ticket

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2, §4 item 7.

## Status
**Proposal only. Do not implement without a build/no-build decision.**

## Confirmed current state
"Add Member" on both platforms offers exactly two modes — "Registered email" and "Placeholder name" —
and nothing else:
- Web: `GroupDetailPage.tsx`'s Add Member dialog, `SegmentedTabs` with those two options only.
- Mobile: `GroupDetailScreen.tsx`'s Add Member sheet, the same two fields, no third option.

Neither platform has any share-link or OS share-sheet UI today. This is a genuine gap, not a
regression — worth being precise about, since an earlier ticket (TS-GRP-137) described web having an
`InviteDialog.tsx` with a "Copy" button and mobile using `Alert.alert('Invite link', ...)`. Neither
exists in the current codebase — that UI appears to have been removed or never actually landed since
that ticket was written. Recording this so nobody goes looking for a component that isn't there.

**What already exists, unused, at the API layer** (so this isn't starting from zero):
- Backend: `GroupService.create_invite(group_id, email, member_id)` generates a single-use token tied
  to a specific, already-existing `GroupMember` row, returns
  `{ token, url: "{PUBLIC_APP_URL}/groups/join/{token}", expires_at }`.
  `GroupService.accept_invite(token, acceptor_email)` claims that member seat for the accepting email,
  is single-use (`invite.accepted_at` / row deletion), and expires after `_INVITE_TTL_DAYS`.
- Both are wired to real endpoints (`POST /groups/{id}/invites`, `POST /groups/invites/accept`) and
  covered by both platforms' `/groups/join/:token` (web route) and `trackspense://join/{token}`
  (mobile deep link) — join-by-token already works end-to-end if you have a URL.
- Web's `api/groups.ts` already has a `createInvite()` client function that calls the endpoint — it's
  simply never invoked from any page. Same shape of gap as TS-GRP-145's dead `refresh()` finding.

**The one real gap: generating and sharing the link is not exposed anywhere in either UI.**

## Important design constraint the backend already encodes
`create_invite` requires a `member_id` — it invites a specific, already-created placeholder seat, not
"anyone holding this link becomes a new member." This is **not** the fully generic Splitwise-style
"one link per group, anyone can join" model — it's closer to "convert this placeholder into a real
member via a link" model. A true generic-join-link (no pre-existing placeholder required) would need a
small backend change (an invite scoped to a group with no `member_id`, creating a brand-new member row
on accept instead of claiming an existing one). Worth deciding which model you actually want before
scoping a build ticket — they're different amounts of work and slightly different product behavior
(placeholder-claim vs. anyone-can-join).

## Proposed UX (assuming the placeholder-claim model, minimal-change path)
1. Add Member dialog gets a third option: "Share a link" (alongside Registered email / Placeholder
   name) — or, simpler: after creating a placeholder member, surface a "Share invite" action next to
   their row (they already show up as `status === 'invited'` in the members list today).
2. Tapping it calls the existing `createInvite(groupId, memberId)` and gets back a URL.
3. **Web:** use the [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
   (`navigator.share({ url, title, text })`) where supported (most mobile browsers, some desktop
   browsers), falling back to copy-to-clipboard + a toast where it isn't (desktop Chrome/Firefox don't
   support it as of now).
4. **Mobile:** React Native's `Share.share({ message, url })` — native OS share sheet, exactly the
   ticket's ask.
5. Deep-linking already works on both platforms (`/groups/join/:token`, `trackspense://join/{token}`) —
   no new join-handling logic needed for this minimal path.

## Explicitly not decided / needs your call
- Placeholder-claim link (small effort, matches current backend) vs. generic anyone-can-join link
  (backend model change, matches "Splitwise pattern" more literally — Splitwise's group links let
  anyone with the link join directly, no pre-created placeholder).
- Whether the share action lives inline per-placeholder-row, or as a separate "Invite via link" entry
  point independent of creating a placeholder first.
- Web Share API's inconsistent desktop support — acceptable to fall back to copy-link, or is a "share
  sheet" experience specifically required on desktop too?

## Recommendation
Given the backend and deep-link plumbing already exist, the placeholder-claim path is a small,
low-risk UI-only ticket (a button + `navigator.share`/`Share.share` + clipboard fallback) — genuinely
"finish wiring up code that's already there," not new architecture. The generic-anyone-can-join model
is closer to real feature work (schema/service change) and probably deserves being scoped and decided
on its own if that's actually the behavior you want, rather than bundled into "just add the button."

## Files that would be touched (if approved)
- `varavu_selavu_ui/src/pages/GroupDetailPage.tsx` (or a small new `ShareInviteButton` component)
- `varavu_selavu_mobile/src/screens/GroupDetailScreen.tsx`
- Only if the generic-join model is chosen: `group_service.py`'s `create_invite`/`accept_invite`,
  `groups_routes.py`, plus a migration if the schema needs a nullable `member_id` on `GroupInvitation`
  (worth checking — it may already be nullable).

## Next step
Awaiting a build/no-build decision, and if build: which model (placeholder-claim vs. generic-join).
