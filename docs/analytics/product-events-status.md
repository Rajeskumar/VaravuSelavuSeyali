# Web product events

TS-GA4-001 · Phase 3. The [event catalog](event-catalog.md) remains the approved contract. The web producers are in the local worktree and use the disabled-by-default foundation. The base app does not load a real GA tag without an approved destination and explicit build configuration.

| Journey | Implementation boundary |
|---|---|
| Registration and sign-in | Register and login API acknowledgements are independent. Google authentication only emits a confirmed login. A user-initiated sign-out is distinct from session expiry. |
| Expense capture | Quick Capture, quick log and the legacy form pass a capture method and operation token to the expense API adapters. Success comes from the acknowledged write before secondary tag/cache work. Timeouts and lost replies produce an unknown outcome and never trigger a retry from analytics. Undo is separately classified and excluded by the catalog’s acquisition and activation definitions. |
| Editing and deletion | Composite edits count after item and header writes, when applicable. Deletion is counted after acknowledgement. Moving an existing expense to a group is excluded from create counts. |
| Suggestions and receipts | One suggestion request per current form revision can serve both debounce and save. Stale responses are excluded. Category acceptance or override is measured only when the resulting expense is confirmed. Receipt parse has one start and one terminal event. Receipt-based saves use the canonical expense event and receipt method. |
| Groups and settlements | The create, invite and settlement acknowledgement owns each event. Invite acceptance only emits after the next safe group detail view. The handoff is an expiring in-memory operation token, with no invite or group identifier. |
| Ask and analysis | Visible Ask entry emits an open event. The query starts after AI consent, if granted. A valid response, service failure and explicit Stop have separate outcomes. Analysis emits the active tab and Expenses reports only the filter kind. |
| Recurring and export | Recurring operations use the API acknowledgement and the execute-now created flag. Export only counts when a download is initiated. |

The catalog’s reserved milestones remain deferred. Product analytics measures the consented web cohort. Actual Google SDK and DebugView validation, GA4 Admin changes, and production activation remain pending. See [verification report](verification-report.md).
