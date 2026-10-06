# Performance standard

No Lighthouse/bundle budgets exist yet; judge against the patterns the codebase already uses.

## Backend
- No N+1: list endpoints load related rows with joins/`selectinload`; aggregates (item/merchant insights) are **pre-aggregated at save time** (`insights_aggregation_service`) — don't recompute over all history per request.
- Every list endpoint is paginated/bounded; filters hit indexed columns (check the migration adds an index for new filter/sort columns).
- Heavy work goes to `BackgroundTasks`, not the request path; LLM/OCR calls are the slow path — keep them behind the cheap deterministic tiers first.
- Cloud Run cold starts: no heavy import-time work.

## Web
- TanStack Query `staleTime` 1 min by default; avoid refetch loops and over-invalidation (`refreshExpenseViews` list is intentionally scoped).
- Infinite scroll feeds (`ExpenseFeed`) virtualise or paginate; don't render unbounded rows. Debounce search (`useDebouncedValue`).
- Plotly is heavy: lazy-load chart code, memoise traces, never build a chart in a tight render loop.
- Overlays are lazy-mounted; avoid mounting data-fetching components before they're opened.
- Images/fonts: sized, compressed; no layout shift from late content.

## Mobile
Lists virtualised (`SectionList`/`FlatList` with keys), no heavy work on the JS thread during gestures, OCR on-device.

## Evidence
Cite the query/render path and its scaling (rows × members × months). Measure when claiming a regression (EXPLAIN, React profiler, network panel). Severity: unbounded growth on a hot path is P1; micro-optimisation is P3.
