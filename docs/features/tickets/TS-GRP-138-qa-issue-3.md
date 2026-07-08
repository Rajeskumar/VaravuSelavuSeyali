# TS-GRP-138: Recurring "Run now" / execute_now action, restore

## Description
The "Run now" action for recurring templates was dropped during the recent design redesign and needs to be restored to match the updated design spec.

## Finding / Root Cause
The backend endpoint `POST /recurring/execute_now` is fully implemented and functioning. However, the `RecurringCard.tsx` frontend component (part of the TS-DES-110 redesign) completely omits the "Run now" button.

## Proposed Fix
Restore the "Run now" action button next to the Due chip on active templates in `RecurringCard.tsx` (using the `docs/design/prototypes/Recurring.jsx` prototype as a reference). When clicked, it should call `executeRecurringTemplate` (which hits `POST /recurring/execute_now`) and display a brief "Logged" confirmation state.
