# TS-GRP-137: Share-link group invitation not working or not implemented

## Description
During QA, it was found that share-link group invitation is missing native share-sheet integration.

## Finding / Root Cause
The invite-link generation API exists on the backend (`create_invite`), returning a URL. Join-via-link handling also exists on both web (`/groups/join/:token`) and mobile (`trackspense://join/{token}`). However, **native share-sheet integration is not implemented**.
- On Mobile (`GroupDetailScreen.tsx`), the generated link is currently just displayed using `Alert.alert('Invite link', invite.url)` instead of invoking React Native's `Share.share` API.
- On Web (`InviteDialog.tsx`), it just displays a modal with a "Copy" button.

This is a real feature gap, not a bug.

## Proposed Fix
Flag this for a design pass to implement native OS share-sheet integration, matching Splitwise's invite-link pattern. Once designed, update `GroupDetailScreen.tsx` to use `Share.share()` on mobile.
