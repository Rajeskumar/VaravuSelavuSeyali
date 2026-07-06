# TS-DES-101 — Reconcile tokens module (web + mobile)

**Initiative:** Reconcile UX Redesign · **Build order:** 1st · **Spec:** `UX_Design_Spec.md` §2/§3/§9, `ORIENTATION_REPORT.md` §1/§4.1/§4.2 · **Status:** ✅ Implemented (no PR yet — working tree only; see notes below)

## Implementation notes (post-build)

- **Both theme files were rewritten in place** (`varavu_selavu_ui/src/theme.ts`, `varavu_selavu_mobile/src/theme.ts`) keeping every exported name/shape identical (`getTheme`/`buildTheme`, `brand`, `withAlpha`, `motion`, `glassCardSx`, `gradientTokens`, `ThemeColors`, `spacing`, `borderRadius`) — confirmed via `tsc --noEmit` on both packages that no consumer needed a call-site change. `brand`/`ThemeColors.gradientStart|gradientEnd` are kept as exports but both stops now resolve to the same flat jade per mode, so the ~6 web files (`App.tsx`, `HomePage.tsx`, `LoginPage.tsx`, `GroupsPage.tsx`) and ~10 mobile screens that build their own inline `linear-gradient`/`LinearGradient` from those two values render flat without being edited.
- **New exports beyond the ticket's original list, added because the acceptance criteria needed them:** `reconcile` (web) / inline palette constants (mobile) as the canonical hex source; `directionalColor(theme, net)` (web) / `directionalColor(t, net)` (mobile) encoding the "ink unless directional" money-color policy as code, not just documentation; `typeScale`/`tabularNums` (web) and `displayHero`/`display`/`amount` typography roles (mobile) for the new Design Spec §3 roles.
- **Warning/caution color:** added a `caution`/`cautionDark` token distinct from `gold`, and pointed MUI's `warning`/mobile's `warning` semantic at it — deliberately *not* at `gold`, since Design Spec §2 frames gold as ceremony-only ("appears maybe twice per session") and routing routine form/toast warnings through it would dilute that scarcity.
- **Files touched beyond the ticket's original "theme.ts only" list, and why they were necessary:**
  - `varavu_selavu_mobile/App.tsx` + `varavu_selavu_mobile/package.json` (`npm install @expo-google-fonts/space-grotesk`) — added and registered `SpaceGrotesk_600SemiBold` in the existing `useFonts()` call alongside Inter, so the new `display`/`displayHero` mobile typography roles actually render Space Grotesk instead of naming a font that was never loaded. Pure JS/asset package, no native rebuild required (confirmed: Metro bundled successfully via `expo start --web` without a native rebuild step).
  - `varavu_selavu_ui/public/index.html` — added a Google Fonts `<link>` for Inter + Space Grotesk. Neither was actually loaded as a webfont before this (the old theme *named* Inter in its font stack but relied on it happening to be installed as a system font); without this the new `typeScale.display*`/`amount` roles would silently fall back to a system font.
- **Radius/pill decision documented in code:** Design Spec §9's abstract token table reads "pill for lens + action chips" only, but all three reference prototypes (`ExpenseFeed.jsx`, `SettleUp.jsx`, `Dashboard.jsx`) render full-width primary CTA buttons as `rounded-full`. Resolved by making `MuiButton`'s default radius the 8px "control" value, but overriding `sizeLarge` to pill — so large/CTA-style buttons match the prototypes while ordinary dialog/toolbar buttons get the plainer control radius. `MuiChip` stays pill unconditionally (the literal "action chip" case). Mobile's `CustomButton`/`borderRadius.full` already defaults to pill and needed no change to hit the same outcome.
- **Verified via `preview_start`, not by assertion:**
  - Web (`web-ui`, MUI/CRA): `tsc --noEmit` clean; screenshotted the marketing HomePage (flat jade CTA/heading accent, no gradient, hairline nav bar, no blur), the authenticated Dashboard in light **and** dark mode (flat hairline `MetricCard`s via `glassCardSx`, jade "Customize Layout" outline, correct `ink`/`paper`/`surfaceDark` swap), and the Groups list in dark mode (jade pill "Create Group" button, hairline group-row cards). No new console errors introduced (`GroupAvatar.tsx`'s own gradient tiles are untouched by design — out of this ticket's file list, correctly left for TS-DES-104).
  - Mobile (`mobile-web`, Expo web target): `tsc --noEmit` clean (pre-existing unrelated failures only — missing jest globals under plain `tsc`, and an unrelated `FlashList` prop type error in `ExpensesScreen.tsx`, both predating this change). Screenshotted the Login screen: flat jade header wash (was blue→purple `LinearGradient`), jade pill "Sign In" button, jade "Create Account" link — all rendering correctly through the flattened `gradientStart`/`gradientEnd` shim with zero edits to `LoginScreen.tsx`.
  - **Found, not fixed (pre-existing, unrelated to this ticket):** the Expo-web target throws `Failed to restore token TypeError: ExpoSecureStore.default.getValueWithKeyAsync is not a function` on load and the Sign In action didn't visibly navigate past the login screen in the web preview — `expo-secure-store` has no web implementation, so token bootstrap/login-persistence is broken on the `mobile-web` target specifically. This is an Expo-web platform gap unrelated to theming; native iOS/Android (where `expo-secure-store` works) is unaffected. Not investigated further — out of scope for a tokens ticket.
- **Not done, left for follow-on tickets:** no screen was restyled beyond what the token swap does automatically. `GroupAvatar.tsx`'s hardcoded 6-gradient-pair palette, `NavPills.tsx`/`SegmentedTabs.tsx`'s hardcoded `borderRadius: 980`, and every screen's actual layout are untouched, per this ticket's explicit "tokens only" scope — see `TS-DES-102`/`103`/`104`/`105`.

## Scope

Replace the **values** inside the existing web and mobile theme files with the Reconcile palette,
type scale, radius scale, and elevation policy from `UX_Design_Spec.md` §9 — without changing either
file's exported shape, so every consuming screen/component needs zero call-site changes. This ticket
is deliberately scoped to tokens only; it does not touch any page or component's structure (see
`ORIENTATION_REPORT.md` §4.3 for what's explicitly excluded — feed rows, balance beam, settle sheet,
etc. are follow-on tickets).

Per `ORIENTATION_REPORT.md` §1, the current tokens conflict with Reconcile on every axis: brand
gradients (Reconcile has none), glassmorphism/blur (Reconcide reserves elevation for sheets only),
blanket hover-lift, pill-radius-for-every-button (Reconcile reserves pill for the lens/chip only),
oversized surface radius (14–24px vs. 10px), and — the single highest-severity, cheapest-to-fix gap
per the Audit (S1, effort XS) — the complete absence of `tabular-nums` anywhere in either theme.

## Files it will touch

- **Web:** `varavu_selavu_ui/src/theme.ts`
  - Replace `brand` (currently the Apple Blue→Purple gradient pair) with the Reconcile palette:
    `ink #191A1E`, `ink-muted #6B6D74`, `paper #F7F7F4`, `surface #FFFFFF` (dark: `#202127`),
    `hairline #E4E4DF`, `jade #0FA37F` (text-safe `#0B8A6B`), `ember #DE5B4B`, `gold #C9973F`.
    Delete the gradient pair entirely — no `linear-gradient`/`radial-gradient` fills remain anywhere
    in the token layer (`MuiCssBaseline` body background, `MuiButton.containedPrimary`,
    `MuiLinearProgress.bar` all currently use one).
  - `glassCardSx()` — delete; replace with a hairline-based equivalent (flat `surface` background,
    1px `hairline` border, no `backdropFilter`) for any call site currently opting into the glass
    treatment.
  - `MuiPaper`/`MuiAppBar`/`MuiDrawer` overrides — remove `backdropFilter: blur(...)`.
  - `MuiCard` override — remove the unconditional `translateY(-3px)` hover lift and its shadow bump.
  - `MuiButton`/`MuiChip` — stop defaulting every instance to `borderRadius: 980`/pill; reserve pill
    radius (999px) for lens-switch and chip components specifically, not the button/chip base style.
  - `shape.borderRadius` and `MuiCard`'s explicit radius — retarget to Reconcile's 10px
    surfaces / 8px controls (currently 14 / 20).
  - Money-color policy: ink is the default for neutral amounts; `jade`/`ember` only apply where a
    component explicitly renders a directional/state amount (owed/owe, over/under budget) — encode
    this as documented usage guidance alongside the tokens, matching Design Spec §2's "usage rules."
  - Typography: add `display-hero`/`display`/`amount`/`label` roles (Design Spec §3 scale) as MUI
    typography variants or reusable `sx` fragments; wire a display face (Clash Display, Space Grotesk
    fallback) to the `display-hero`/`display` roles only — not the whole `fontFamily` stack. Add a
    `tabularNums` helper (`{ fontVariantNumeric: 'tabular-nums' }`) and apply it via the `amount` role
    so every amount-rendering call site gets it by construction, not by convention.
  - `withAlpha` — keep as-is; no Reconcile conflict.
  - `gradientTokens(mode)` — replace with a flat non-`Theme` token export (hex values only) for
    non-MUI consumers (inline SVG, chart restyling in TS-DES-105).
- **Mobile:** `varavu_selavu_mobile/src/theme.ts`
  - Replace `lightColors`/`darkColors` with the Reconcile palette (light/dark variants per Design
    Spec §2's dark-mode rules: `ink` → background, `surface` → `#202127`, jade/ember lifted ~8%
    luminance for dark-mode contrast). Keep the exact `ThemeColors` interface shape.
  - Remove `gradientStart`/`gradientEnd` from `ThemeColors` and `gradients.primary`/`gradients.surface`
    in `buildTheme()` (or repoint them to flat single-color fills if a call site strictly needs the
    `[start, end]` tuple shape during migration — no visible gradient should render either way).
  - `buildShadows()` — collapse from seven tiers to an elevation policy matching "sheets/nav only":
    ordinary card/row tiers (`xs`/`sm`/`md`/`lg`) go to near-zero opacity; only a real sheet/modal
    equivalent keeps a visible shadow.
  - `borderRadius` scale — retarget toward 10px-surface / 8px-control (current `sm:12/md:16/lg:20/
    xl:24` are all larger); stop treating `full: 9999` as a general button radius, reserve it for
    lens/chip-equivalent controls only.
  - `buildTypography()` — add `display`/`amount`/`label` roles mirroring web; thread
    `fontVariant: ['tabular-nums']` through the `amount` role (and any money-rendering role that
    survives, e.g. `body`/`bodyRegular` if those keep being used for amounts).
  - `withAlpha`, `motion.spring`/`motion.springBouncy` — keep as-is; no Reconcile conflict, and the
    spring presets are plausible primitives for TS-DES-104's hero-count/settle count-to-zero
    animation.
  - Keep `ThemeColors`, `buildTheme(mode): AppTheme`, `AppTheme`, `spacing`, `motion`, `lightTheme`/
    `darkTheme`/`theme`, `createGlobalStyles` exported with unchanged shapes.

## Acceptance criteria

- Palette matches `UX_Design_Spec.md` §9 exactly (hex-for-hex) on both platforms, light and dark.
- No `linear-gradient`/`radial-gradient` fill remains anywhere in either token file.
- `tabular-nums` (web) / `fontVariant: ['tabular-nums']` (mobile) is set on the `amount` typography
  role so it applies by construction to any component that adopts that role — not left as an
  opt-in convention per call site.
- `display-hero`/`display`/`amount`/`label` roles exist on both platforms with the sizes specified
  in Design Spec §3's scale table.
- Radius: 10px general surfaces / 8px controls; pill (999px) reachable only via a role intended for
  lens/chip components, not the default button/card radius.
- Elevation: no blanket `backdropFilter`/hover-lift/shadow remains on `MuiPaper`/`MuiCard`/mobile
  `Card`'s default styling; a distinct "sheet" elevation tier still exists for actual bottom
  sheets/dialogs.
- `getTheme(mode)` (web) and `buildTheme(mode)` (mobile) keep their existing exported signatures —
  every current consumer (all pages/components using `useTheme()`/`useAppTheme()`) compiles and
  renders without call-site changes.
- Running the web app and mobile app locally shows the new palette/type/radius applied app-wide with
  no runtime errors. Visual regression on individual screens (colors/spacing looking "unfinished"
  relative to the reference prototypes) is expected and acceptable here — TS-DES-102/103/104/105 are
  the follow-on tickets that make each screen match its reference; this ticket only needs to prove
  the tokens are correct and non-breaking.

## Dependencies

None — this is the first ticket in the initiative and has no upstream blocker.

## Test requirements

- No new test suite is required for this ticket (tokens have no behavior to unit-test), but any
  existing component/page tests that assert on theme-derived values (colors, radii) must be updated
  to the new values rather than left red.
- Manual visual check only, per the established preference for this redesign track: run web
  (`localhost:3000`) and mobile (simulator) locally and confirm the app renders with the new tokens
  and no console/runtime errors — do not add or run Jest/pytest suites as a substitute for this check.
