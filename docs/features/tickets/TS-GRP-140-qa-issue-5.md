# TS-GRP-140: Shared page-layout component for public + authenticated pages

## Source
`docs/design/Live_QA_Findings_and_Plan.md` §2 ("Container width is inconsistent") and §4 item 1.

## Description
Authenticated pages (Dashboard, Expenses, Analysis, Item Insights, Merchant Insights, Recurring, AI
Analyst) consistently wrap their content in `MuiContainer maxWidth="lg"` (1200px) via `MainLayout.tsx`.
Login and Forgot Password use no `MuiContainer` at all — a full-bleed, vertically-centered `Box`. The
QA doc flagged this "by inference" for Register and Home, without directly checking — the ticket
explicitly asked to confirm rather than assume before starting.

## Investigation

Direct check of every page's top-level content wrapper:

| Page | Wrapper today |
|:--|:--|
| Dashboard/Expenses/Analysis/Item Insights/Merchant Insights/Recurring/AI Analyst/Groups/Profile | `MainLayout.tsx` → `<Container maxWidth="lg" sx={{ pb: 12, pt: 4 }}>` |
| **Login** | **Does not actually match the pattern the ticket assumed.** Read the full file (not just grepped for "Container") — `LoginPage.tsx` is a deliberate two-column split-screen: a full-bleed `flex:1` banner-image panel and a fixed-520px form panel side by side (`flexDirection: {xs:'column', md:'row'}`). It has no Container because it structurally can't — both panels need to fill the available width. This is the same category of "legitimate exception" as Home below, not an oversight to fix. |
| **Register** | **Confirmed matches the simple pattern** — `<Box sx={{ minHeight: 'calc(100vh - 64px)', display:'flex', alignItems:'center', justifyContent:'center', p:4 }}>` wrapping a single fixed-420px `Card`, no Container. Read in full to confirm, not just grepped. |
| **ForgotPassword** | **Confirmed matches** — identical single-card centering pattern. |
| **JoinGroupPage** | **Also matches** — same pattern (not mentioned in the QA doc, found in this pass), single fixed-420px `Card`. |
| FeatureRequest / Contact | `<Container maxWidth="sm" sx={{ mt: {xs:4,md:8}, mb: 4 }}>` |
| **Home** | **Does NOT match the "no Container" pattern the doc inferred.** Six separate `<Container>` instances across its sections, maxWidth alternating between `"md"` (hero copy, testimonial-style sections) and `"lg"` (feature grid, footer) — a deliberate, normal marketing-landing-page pattern, not an oversight. |

**Correction to the source doc's premise, twice over:** the doc's one *directly-tested* claim (Login has
no Container) is true but was mis-attributed as an inconsistency to fix — it's a deliberate split-screen
design, not a simple content page missing a wrapper. The doc's two *inferred* claims fare oppositely:
Register (and JoinGroupPage, not previously checked at all) genuinely do match the simple
"single-card, no-Container" pattern and are safe to fold into one shared component with zero visual
change (maxWidth on an outer wrapper doesn't constrain a narrower fixed-width card nested inside
regardless). Home does not match at all — it's Login's kind of legitimate exception, just for a
different structural reason (multi-section marketing page vs. two-column split-screen).

**Revised scope:** `PageContainer` is applied to MainLayout (authenticated pages), Register,
ForgotPassword, JoinGroupPage, FeatureRequest, Contact, and Home's six sections (component swap only,
values unchanged). **Login is explicitly left untouched** — same reasoning as Home, just discovered
later. Retrofitting it onto the shared primitive isn't right either: its two panels aren't "content in
a container," they're a fixed two-pane shell of their own. If a genuinely shared *page-shell* concept
is wanted later (distinct from `PageContainer`'s "content width" job), that's a separate, bigger
conversation — flagging it rather than forcing Login's layout to fit a component whose contract doesn't
describe what this page actually is.

## Fix

New `components/layout/PageContainer.tsx`:

```tsx
interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: Breakpoint | false; // default 'lg'
  center?: boolean;              // vertical centering for single-card pages (default false)
  sx?: SxProps<Theme>;
}
```

Wraps MUI's `Container`, adding an optional `center` mode (the `minHeight`/`display:flex`/
`alignItems:center`/`justifyContent:center` treatment Register/ForgotPassword/JoinGroup already each
reimplement inline) so those three pages collapse to one shared call instead of three copies of the
same Box.

Applied to:
- `MainLayout.tsx` (all authenticated pages) — swaps its inline `Container maxWidth="lg"` for
  `<PageContainer sx={{ pb: 12, pt: 4 }}>` (default `lg`, unchanged behavior).
- `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `JoinGroupPage.tsx` — swap their duplicated centering
  `Box` for `<PageContainer center maxWidth="sm" sx={{ p: 4 }}>`. Passing an explicit `maxWidth="sm"` is
  a genuine behavior change from today's "no cap at all" — see Alternatives.
- `FeatureRequestPage.tsx`, `ContactPage.tsx` — swap `Container maxWidth="sm"` for
  `<PageContainer maxWidth="sm" sx={{...}}>` **unchanged width** (TS-GRP-141 handles FeatureRequest's
  width specifically — kept separate so the two tickets' diffs don't collide).
- `HomePage.tsx` — swap each of its six `<Container maxWidth="md"|"lg">` for the equivalent
  `<PageContainer maxWidth="md"|"lg">`, same values, same visual result.
- **`LoginPage.tsx` — explicitly not touched.** Its two-column split-screen layout isn't "content in a
  container" in the sense this component addresses; see the correction above.

### Alternative considered, and why `maxWidth="sm"` (not `false`) for the auth pages
The literally-safest option is `maxWidth={false}` for Register/ForgotPassword/JoinGroup (matches
current "no cap" exactly, zero risk). But the QA doc's underlying complaint is inconsistency, not
literally "must be uncapped" — an uncapped outer wrapper on an ultra-wide monitor lets the vertical
centering flex container stretch to the full viewport width with the (already width-capped) inner card
centered in the middle, which is harmless either way. Passing `maxWidth="sm"` (bounding the outer
wrapper to roughly the card's own width) is marginally more correct semantically and avoids leaving one
of the three pages as a bare `Box`-passthrough special case inside the new shared component's contract.
Given this is a judgment call with no visible difference in either direction on realistic viewport
widths, going with `maxWidth="sm"` for a cleaner one-shape API — flag if you'd rather keep `false`.

## Files touched
- `varavu_selavu_ui/src/components/layout/PageContainer.tsx` (new)
- `varavu_selavu_ui/src/components/layout/MainLayout.tsx`
- `varavu_selavu_ui/src/pages/RegisterPage.tsx`
- `varavu_selavu_ui/src/pages/ForgotPasswordPage.tsx`
- `varavu_selavu_ui/src/pages/JoinGroupPage.tsx`
- `varavu_selavu_ui/src/pages/FeatureRequestPage.tsx`
- `varavu_selavu_ui/src/pages/ContactPage.tsx`
- `varavu_selavu_ui/src/pages/HomePage.tsx`
- `varavu_selavu_ui/src/pages/LoginPage.tsx` — **not touched**, listed here only to record that it was
  considered and deliberately excluded.
- `varavu_selavu_ui/src/pages/HomePage.tsx`

## Acceptance criteria
- Every page except Login renders its content through `PageContainer`, not a raw `MuiContainer`/ad hoc
  `Box`. Login is deliberately excluded — see correction above.
- No visual regression on Dashboard/Expenses/Analysis/etc. (still `lg`, same padding).
- Register/ForgotPassword/JoinGroup render identically at common viewport widths (their inner card was
  already narrower than `sm`).
- Home's six sections keep their current per-section widths exactly.
- Login's two-column split-screen layout is pixel-identical to before (untouched).
- `npx tsc --noEmit` clean; existing page test suites still pass.

## Out of scope (flagged, not touched here)
- `ContactPage.tsx` shares FeatureRequestPage's exact `maxWidth="sm"` oddity but isn't named in TS-GRP-141 — worth a look once that ticket lands, not bundled in here.

## Implementation notes (post-build)

- Built `PageContainer.tsx` extending MUI's own `ContainerProps` (via `Omit<ContainerProps,
  'maxWidth'>` + an explicit `maxWidth` override) rather than a hand-rolled prop list, specifically so
  it forwards arbitrary Container props (`id`, etc.) unchanged — needed once HomePage's `id="product"`
  anchor section was swapped over.
- HomePage's six `Container` instances were swapped via a scoped `sed` pass (`<Container ` →
  `<PageContainer `, closing tags too) rather than six manual edits, then verified with `tsc` — all
  `maxWidth`/`sx` values passed through unchanged.
- `Box` import was left in place on Register/ForgotPassword (still used for the form's inner
  `component="form"` wrapper) but dropped entirely from `JoinGroupPage.tsx`, which had no other use.
- **Verified live**: `.MuiContainer-root` computed `max-width` measured at exactly `1200px` on both
  Dashboard and Feature Request post-fix (previously 600px on the latter — see TS-GRP-141). Login's
  split-screen layout screenshotted pixel-identical to pre-change, confirming the deliberate exclusion
  didn't regress anything.
- `npx tsc --noEmit` clean; full web Jest suite (46 tests) passes unchanged.
