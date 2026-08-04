# Responsive / mobile-rendering suite (P1-4)

Verifies at 375×812 and 390×844 that the primary screens have no horizontal
overflow, no touch target under 44px, and no ellipsised text that widens the
layout — plus that no JWT is reachable from page JavaScript (P0-1) and that the
amount field cannot be driven out of range (P1-3).

## Running

These tests drive a real login, so the API and the dev server must both be up
and a test account must exist.

1. Start the API (port 8080) and the CRA dev server.
2. Point the suite at the app and give it credentials:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_EMAIL=you@example.com E2E_PASSWORD=... npx playwright test
```

`PLAYWRIGHT_BASE_URL` matters in practice: CRA falls back to a random port when
3000 is already taken.

One project only:

```bash
npx playwright test --project="iPhone SE/X (375x812)"
```

## How it works

`auth.setup.ts` logs in once and saves the cookie jar to `e2e/.auth/user.json`;
the device projects reuse it via `storageState`. That is not just an
optimisation — `/auth/login` is rate-limited to 5/minute, so logging in per test
starts returning 429 partway through a run.

Because tokens are HttpOnly cookies there is no token to inject into
localStorage; `storageState` captures the cookies (and the non-sensitive
`vs_user` marker) instead.

## Two assertions that are easy to get wrong

**Horizontal overflow.** The pass/fail signal is
`document.documentElement.scrollWidth <= window.innerWidth`. Checking individual
elements for `right > innerWidth` reports false positives: the decorative
`AmbientBackground` blobs are deliberately oversized and clipped by an
`overflow-x: hidden` parent, and wide content is allowed to scroll inside its own
container. `findBleedingElements` therefore ignores anything with a clipping or
scrolling ancestor.

**Touch targets.** Measuring `getBoundingClientRect()` also reports false
positives: `SegmentedTabs` intentionally keeps a compact 22–32px pill and expands
its tappable region to 44×44 with an invisible `::after`. `findSmallTouchTargets`
hit-tests outward from each control's centre with `elementFromPoint`, so an
expanded hit area passes and only a genuinely small target fails.
