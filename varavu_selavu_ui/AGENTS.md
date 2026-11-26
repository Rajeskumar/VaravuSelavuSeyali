# AGENTS.md — varavu_selavu_ui (React web)

Root `AGENTS.md` rules apply. Commands: `make lint-web typecheck-web test-web`, `make audit-web`,
`scripts/quality/accessibility.sh [--axe]`.

## Key Decisions
- **One query client per signed-in account** (`context/SessionQueryProvider`, mounted by `App`; never a module-level `QueryClient`): query keys carry no user, so it is replaced on logout, forced (401) logout and an account switch from another tab. Mobile has the same rule (`core/auth/SessionQueryProvider`).
- **Accessibility conventions** (one h1 per page, titles in `RouteA11y.tsx`, named dialogs, announced errors, no nested interactives) are the rules in `.ai-sdlc/standards/accessibility.md` — follow them for any UI change.
- **Browser requests send `X-TrackSpense-Client: web`** and receive no tokens in JSON bodies (cookie session + CSRF).
- **Ask conversation state lives above the responsive Drawer** (`useChatConversation`): keep pending work on close/breakpoint changes, clear on account change/logout, mount API-fetching UI lazily.
- **MCP pages are hidden when MCP is off** (`McpGate` → 404, `src/components/common/McpGate.tsx`).
- **Home page product tour uses real screenshots** in `public/screenshots/home/<screen>-<light|dark>.jpg` (1440×900 @1.15, demo account seeded by `varavu_selavu_app/scripts/seed_demo.py` against a local throwaway DB). Re-capture both themes when those screens change.
- **Behavioral analytics:** all telemetry goes through `src/analytics`; never send domain objects, email/IDs, money, raw URLs or errors. Update its closed schemas/route registry plus `docs/analytics/event-catalog.md` and payload tests when adding producers/routes. GA4 requires the approved host and stream, release configuration, and user consent. Mobile (iOS/Android) is TS-GA4-002 and shares `docs/analytics/catalog.v1.json` (`events.test.ts` fails on drift); MCP needs its own scope.
