# Orientation Report — Reconcile Design System vs. Current Implementation

> **Read-only pass.** No code was modified to produce this report. Sources read, in order:
> 1. `docs/features/groups/TrackSpense_Groups_Product_Spec.md` (file exists under `docs/features/`, not `docs/feature/`)
> 2. `docs/design/TrackSpense_UX_Design_Spec.md` (the "Reconcile" design language)
> 3. `docs/design/TrackSpense_UX_Audit_and_Redesign.md`
> 4. `docs/design/prototypes/ExpenseFeed.jsx`, `docs/design/prototypes/SettleUp.jsx` (no `.reference` suffix on disk)
> 5. `varavu_selavu_ui/src/theme.ts`, `varavu_selavu_ui/src/pages/ExpensesPage.tsx`, `varavu_selavu_ui/src/pages/DashboardPage.tsx`
> 6. `varavu_selavu_mobile/src/theme.ts`, `varavu_selavu_mobile/src/components/Card.tsx`
> 7. `docs/features/tickets/TS-GRP-107-web-groups-pages.md`, `TS-GRP-108-web-scope-integration.md`, `TS-GRP-109-mobile-screens.md` (pulled in to answer §3 below)

**Headline finding:** the current `theme.ts` (web and mobile) is not the theme the UX Audit is grading — it's a *different, newer* one ("Apple structure, Revolut color": Apple-Blue→Purple gradient, glassmorphism, pill-everywhere) than the indigo/teal glassmorphism the Audit document describes reasoning about. Both, independently, are exactly what the **Reconcile** spec (§1, principle 5) calls out as "bold everywhere reads as bold nowhere" and what the Audit calls the "template SaaS tell." The Groups feature's Phase-1 UI (TS-GRP-107/108/109) was built against the Apple-gradient theme in a prior redesign pass, meaning it has now drifted from **two** design directions in sequence, not one. This report treats Reconcile as the design system of record and current code as the delta to close.

---

## 1. Theme conflicts: current `theme.ts` vs. Reconcile tokens (§9)

Reconcile's token starter (§9 of the Design Spec):
```
color:   ink #191A1E · ink-muted #6B6D74 · paper #F7F7F4 · surface #FFFFFF
         hairline #E4E4DF · jade #0FA37F (text-safe #0B8A6B) · ember #DE5B4B · gold #C9973F
type:    display Clash Display 600 · body Inter 400/500/600 · amounts Inter tabular-nums
radius:  10px surfaces · 8px controls · pill (999px) for lens + action chips
elevation: reserved for sheets only; everything else uses hairline + tint
motion:  150ms fades/slides; count animations on hero + settle; reduced-motion honored
```

### 1.1 Palette

| Reconcile rule | Current web (`theme.ts`) | Current mobile (`theme.ts`) | Conflict |
|:---|:---|:---|:---|
| One flat signature color (`jade`), no gradients — Reconcile explicitly frames gradients as the "generic dashboard SaaS tell" it's designed to escape (§2) | `brand.gradientStart/End` = Apple system Blue `#007AFF` → Purple `#AF52DE`, used as `backgroundImage: linear-gradient(...)` on `MuiButton.containedPrimary`, the `MuiCssBaseline` body background, `MuiLinearProgress.bar`, and `glassCardSx` | Same gradient pair (`gradientStart/End`) exposed via `ThemeColors` and consumed as `gradients.primary` in multiple screens/components | **Direct, structural conflict.** The single highest-leverage Reconcile ask ("kill the gradient") is the current app's entire brand identity. This is not a hue swap — every gradient-consuming style rule (buttons, progress bars, background washes, card tints) needs to become a flat-fill rule. |
| `ink` is the **default for all neutral money**; green/red reserved for direction/state only, and even then `jade`≠"success green," `ember`≠"error red" | `success: '#34C759'` / `error: '#FF3B30'` (Apple green/red) are the semantic pair already in use for balances (e.g. mobile `BalanceRow.tsx` colors every net amount green/red/gray, never neutral ink) | Same values (`success`/`error`) in `ThemeColors`, same usage pattern | **Two-layer conflict:** (a) the *rule* — money should default to ink and only balances/directional amounts get color — isn't encoded anywhere today; ordinary expense amounts already render in whatever `text.primary` resolves to, which is incidentally close to "ink" in spirit but not by policy; (b) the *hex values* are wrong even where color is legitimately used (Apple green/red ≠ jade/ember, which are cooler/warmer and less saturated by design). |
| `hairline #E4E4DF` divider/border replacing most drop shadows | No `hairline`-equivalent token exists; dividers use MUI's default `divider` (`rgba(0,0,0,0.08)`/`rgba(255,255,255,0.1)`) | `borderLight #E5E5EA` exists and is close in spirit/value, but is one of many border tokens, not a "shadows are rare, hairline is common" policy | Partial gap — mobile already has a plausible token to repoint; web has none and layers borders *and* shadows *and* blur simultaneously, the opposite of "hairline replaces shadow." |
| `gold` is a rare, ceremonial-only accent (reconcile tick, streaks) — "appears maybe twice per session" | No gold/amber ceremonial token; `warning: '#FF9500'`/`#FF9F0A'` exists but is a generic MUI semantic (form validation, alerts), not a scarce reconcile-moment accent | Same (`warning`) | No true conflict, just absence — a `gold` token needs to be added net-new, and using the existing `warning` token for it would be wrong (warning implies "something's off," gold means "something resolved"). |

### 1.2 Elevation / surface treatment

- **Glassmorphism vs. hairline+tint.** Web `theme.ts`'s `MuiPaper` override applies `backdropFilter: blur(20px)` **globally** to every `Paper` (which underlies `Card`, `TableContainer`, dialogs, the redesigned `ExpensesPage` row-list, and `GroupDetailPage`'s balance card via `glassCardSx`). Reconcile: *"Drop global `backdrop-filter`... elevation reserved for sheets only; everything else uses hairline + tint."* This is a direct, blanket-level conflict — not a per-component tweak, since the blur is applied at the `MuiPaper` component-override level and inherited everywhere.
- **Hover-lift on everything.** `MuiCard` in web `theme.ts` applies `transform: translateY(-3px)` + heavier shadow on **every** card hover, unconditionally. The Audit explicitly flags this exact pattern as S2 ("Card hover `translateY(-2px)` on everything... Lifting a *data* card on hover implies it's a button") and lists its removal as a quick win. Mobile's `Card.tsx` doesn't have hover (native, no hover state) but does apply `theme.shadows.sm` unconditionally to every card instance, including `inset` — the same "everything gets a shadow" problem, just without the animated half.
- **Shadow density.** Mobile `buildShadows()` defines seven shadow tiers (`xs/sm/md/lg/fab/nav/colored`) and both `Card` and `globalStyles.card`/`.listSection` apply one by default. Reconcile's "elevation reserved for sheets only" implies most of these tiers should collapse to zero for ordinary list/card rows, with only a `sheet`/`nav`-equivalent tier surviving.

### 1.3 Radius

| Surface | Reconcile | Web current | Mobile current |
|:---|:---|:---|:---|
| General surfaces (cards, papers) | 10px | `shape.borderRadius: 14`, `MuiCard` explicit `20` | `borderRadius.xl = 24` (used by `Card.tsx`) |
| Controls (inputs, small buttons) | 8px | not distinctly tokened — buttons inherit the pill override below | `borderRadius.sm = 12` closest analog |
| Pill (999px) | **Reserved for the lens switch + action chips only** | `MuiButton` root sets `borderRadius: 980` **globally** — i.e. every button in the app is a pill, including primary/secondary/destructive/dialog actions, not just a segmented-lens control; `MuiChip` also globally pill | `borderRadius.full = 9999` exists as a token but is not restricted to lens/chip usage — likely applied broadly wherever "iOS-pill button" styling was wanted |

The radius scale itself is off by roughly double on both platforms (14–24px vs. Reconcile's 10px), and — more importantly — the *pill* radius has escaped its intended scope. Reconcile treats pill shape as a semantic signal ("this is a lens/chip"), not a default button shape; today's app uses pill as the default button shape everywhere, which dilutes that signal to zero.

### 1.4 Typography

- **No display face.** Neither `theme.ts` declares a distinct display typeface. Web's `typography.fontFamily` is a single stack (`-apple-system... Inter, Roboto`) applied uniformly to `h1`–`h6`; mobile's `buildTypography` is Inter-only across `h1`–`caption`. Reconcile requires **Clash Display (or Space Grotesk fallback) reserved exclusively for the True Total / big balances / section moments** — this is a wholesale net-new typeface addition, not a restyle of an existing token.
- **No tabular numerals anywhere — this is the single largest, highest-severity gap.** Neither `theme.ts` sets `fontVariantNumeric: 'tabular-nums'` (web) or RN's `fontVariant: ['tabular-nums']` (mobile) at any level — global, component-override, or per-instance. Grepping the read files confirms it: `ExpensesPage.tsx` renders `${exp.cost.toFixed(2)}` and `${row.myShare.toFixed(2)}` with plain `Typography`; mobile's whole type scale (`h1`...`label`) has no numeric variant at all. The Audit calls this out explicitly and ranks it **S1, effort XS, "do first"** — it is the cheapest, highest-impact single change available and is currently 100% missing on both platforms.
- **No semantic type roles for money.** Reconcile's scale defines `display-hero` (44–56px), `display` (32px), `amount` (16–18px, tabular, for every list figure), `meta` (13px muted), and `label` (11px uppercase tracked). None of these roles exist in either `theme.ts` today; both platforms rely on generic `h1`–`h6`/`body`/`caption` MUI or RN roles with no amount-specific or label-eyebrow variant. Building these as first-class token roles (not ad hoc per-component `sx`/style overrides) is required groundwork before any screen can be restyled consistently.

### 1.5 Motion

- Web: `motion.easing = [0.16, 1, 0.3, 1]` (an Apple-style deceleration curve) is used broadly — including the blanket card-hover lift. Reconcile doesn't mandate a specific easing curve, but does mandate *restraint*: 150ms fades/slides, count-up/down animations reserved for the hero total and the settle-up moment specifically, and universal `prefers-reduced-motion` support. The current app's motion is not scoped to specific "earned" moments — it's applied broadly (every card hover, every page-load `framer-motion` fade) which is a milder, structural version of the same "spend boldness everywhere → reads as nowhere" problem the palette has.
- Mobile: `motion.spring`/`motion.springBouncy` (react-native-reanimated presets) are reasonable primitives that Reconcile doesn't need to replace outright — they can likely be *reused* for the settle-up count-to-zero and hero count animations Reconcile does call for, once those specific moments are built. No hard conflict here, just no "earned moment" usage yet.

---

## 2. ExpensesPage & DashboardPage: restyle-in-place, or structural rebuild?

### 2.1 `ExpensesPage.tsx` — **structural rebuild required**, not a restyle

The page currently has two genuinely different code paths gated on `scope`:

- **`scope === 'personal'`**: a literal MUI `Table`/`TableHead`/`TableRow`/`TableCell`/`TableBody` inside `TableContainer`, column headers (Date/Description/Merchant/Category/Cost), per-row edit/delete `IconButton`s. This is *exactly* the surface both the Reconcile spec (§3, principle 3: "Kill the spreadsheet") and the Audit (§3.3, S1, "the most dated surface... the worst offender on mobile") target for replacement with a day-grouped ledger feed (`ExpenseFeed.jsx`). A table has no structural concept of day-grouping with sticky per-day subtotal headers, swipe-to-reveal edit/delete actions, or tap-to-open bottom-sheet detail — these require a different DOM shape (a flat list of grouped `div`/row blocks, not `<tr>`s) and different interaction wiring (pointer/gesture handlers on rows, a mounted sheet component). **No amount of CSS/theme-token restyling turns a `<Table>` into `ExpenseFeed.jsx`'s behavior.** This path needs to be rebuilt from the reference prototype, not reskinned.
- **`scope !== 'personal'`** (Groups/Combined): already *not* a table — a prior redesign pass converted it to `Paper` + mapped `Box` "rows" (icon tile, description + group-`Chip`, category/date caption, right-aligned share/total). This is structurally closer to a feed row than the personal-scope table, and happens to already put amounts in the theme's default `text.primary` (not a hardcoded semantic color), which coincidentally leans toward Reconcile's "ink for neutral money" rule. However, it is still missing: day-grouping + sticky day-subtotal headers, tabular-nums, swipe actions (mobile analog doesn't apply here since this is web, but hover-reveal actions per §4.1 do), and a tap-to-detail-sheet (rows aren't clickable today). This path is **restyle-plus-meaningful-feature-addition**, not a from-scratch rebuild — but it's also not a pure token swap.

**Net assessment:** because the two scopes currently diverge into different components (`<Table>` vs. `<Box>` rows), and Reconcile's design intent is *one* unified day-grouped feed regardless of scope, the honest fix is to **build one new `ExpenseFeed`-pattern component** (per the reference prototype: day grouping, sticky subtotal header, row = tint-dot + merchant + category + tabular amount, tap → detail sheet, hover-reveal/swipe actions) and have all three scopes (`personal`/`groups`/`combined`) render through it — retiring both the `<Table>` branch and the ad hoc `<Box>`-row branch. That is a structural rebuild of the page, even though roughly half of the groundwork (the row-content model: icon/merchant/category/amount) was already done in the non-personal branch during the prior Apple-gradient redesign pass and can likely be adapted rather than thrown away.

### 2.2 `DashboardPage.tsx` — **structural rebuild required**, and it collides with an existing product decision

Today's dashboard is precisely the pattern both design documents target for removal: three `MetricCard`s (Total/This Month/This Week) above a **user-customizable, drag-and-drop grid** of eight possible card registrations (`sunburstOther`, `sunburstRecurring`, `trend`, `insights`, `recent`, `quickAdd`, `upcoming`, `myGroups`), with layout order persisted to `localStorage` and a whole "Customize Layout"/drag/drop interaction model built around treating the dashboard as *a wall of independent, reorderable cards*. The Audit names this exact structure S1/S2 ("Adding Groups means adding *more* cards... no single focal number") and ranks "Dashboard card-grid → True Total + lens" **S1, effort M, "do first."**

Reconcile's replacement (§4.6, §6) is structurally incompatible with the current architecture, not a visual variant of it:
- **One** hero number (`display-hero`, Clash Display, 44–56px) replaces the three `MetricCard`s.
- A segmented **My Share / I Paid / Group Total** lens re-scopes *that single number* — there is no equivalent state/interaction in the current code (the three `MetricCard`s show three simultaneously-visible different metrics — total/month/week — not three lenses over one figure).
- The reorderable multi-card registry (sunburst × 2, trend, insights, recent, quickAdd, upcoming, myGroups) is explicitly meant to be **deleted**, not rearranged: Reconcile's dashboard content below the hero is just a ranked spectrum bar (§4.3, replacing the sunburst donut/treemap), a slim "My Groups" strip, and the unified feed (§4.1, shared with Expenses) — three elements, not eight registrable cards, and no drag-to-reorder affordance since there's nothing left to reorder.

This means a Reconcile-conformant Dashboard rebuild necessarily **removes the "Customize Layout" feature** (the `editingLayout`/`layoutOrder`/`onDragStart`/`onDrop`/`saveLayout`/`resetLayout` machinery) as a side effect of collapsing eight cards down to ~3 fixed elements. That is a real product/scope decision, not an incidental implementation detail, and it directly collides with the Groups Product Spec:

> **Product Spec §11.2 (decided 2026-07):** *"DashboardPage — layout unchanged: all existing metric cards, charts, and widgets stay exactly as they are... No scope toggle on the dashboard."*

This is the **opposite instruction** from the Reconcile Design Spec's Dashboard direction. The Product Spec's decision predates the Design Spec/Audit (both are dated after Groups Phase-1 shipped) and was made specifically to avoid disrupting the existing card-grid layout while bolting Groups on. Reconcile's whole thesis is that the card-grid is the problem the True Total + lens is designed to solve — including, explicitly, the "how do I show My Share/I Paid/Group Total without three cards" question the Product Spec's own §3.2 money-views model raises. **This conflict needs an explicit product decision (does §11.2 get superseded?) before Dashboard work is scoped** — it isn't something a restyle can route around, since "layout unchanged" and "delete the metric-card wall" cannot both be true.

---

## 3. Do the Phase-1 Groups tickets (TS-GRP-101…111) assume pre-Reconcile UI?

**Yes, for the three UI-bearing tickets — all three need scope amendment before any Reconcile-aligned work proceeds on their surfaces.** The backend-only tickets are unaffected.

| Ticket | UI-bearing? | Assumes stale UI? | Why |
|:---|:---:|:---:|:---|
| TS-GRP-101 (schema/migration) | No | — | Pure DB/ORM, no UI surface. |
| TS-GRP-102 (GroupService) | No | — | Backend service/repo layer only. |
| TS-GRP-103 (SplitEngine) | No | — | Pure calculation functions, no UI. |
| TS-GRP-104 (group expenses + BalanceService) | No | — | `BalanceResponse`/transfer-list API shape is UI-agnostic and already matches what Reconcile's balance-beam view needs (net per member + pairwise transfers) — no backend change required to support the new design. |
| TS-GRP-105 (settlements) | No | — | Same as 104 — API contract already supports the Reconcile settle-up flow (record amount/from/to); no schema/endpoint change implied by the redesign. |
| TS-GRP-106 (analysis scope) | No | — | Query/cache-key logic only. |
| **TS-GRP-107 (web GroupsPage/GroupDetailPage/SplitEditor)** | **Yes** | **Yes — explicitly** | The ticket's own **Scope** line states *"MUI v7 + existing glassmorphism theme."* That "existing" theme (the pre-Apple-gradient glassmorphism the Audit reasons about) has already been superseded once (by the Apple-Blue/Purple gradient `theme.ts` in the prior redesign pass) and is now superseded again by Reconcile. Everything this ticket built — `GroupCard`, `MemberAvatarStack`, `SplitEditor`, `BalanceList`, `SettleUpDialog`, `InviteDialog` — consumes theme tokens (colors, radius, elevation) that are being replaced twice over. **Needs amendment:** re-scope its "Files it will touch" against Reconcile tokens, and reconcile its `BalanceList`/`SettleUpDialog` UI against the `SettleUp.jsx` reference (net-position-first hero, signed avatar-led list, count-to-zero on confirm) rather than the ad hoc table/list styling it shipped with. |
| **TS-GRP-108 (web dashboard/expenses scope integration)** | **Yes** | **Yes — and it directly conflicts with Reconcile, not just staleness** | Its **acceptance criteria include** *"the layout is visually unchanged vs. today"* for the Dashboard — inherited straight from Product Spec §17.1/§11.2. As shown in §2.2 above, this is the literal opposite of Reconcile's Dashboard direction. This ticket also touches `ExpensesPage.tsx`'s scope filter and group-badge column, which (per §2.1 above) needs the day-grouped-feed rebuild, not a badge bolted onto the current table/box-row split. **Needs amendment on two axes:** (a) a product decision on whether "dashboard layout unchanged" still holds given Reconcile, and (b) re-scoping the Expenses-page group-badge/scope-filter work against the new unified feed component rather than the current table+box-row split. |
| **TS-GRP-109 (mobile Groups screens)** | **Yes** | **Yes** | Same theme-staleness pattern as 107, on the mobile side: `GroupsScreen`, `GroupDetailScreen`, `SplitEditor` (RN), `BalanceRow`, `SettleUpSheet` were built (and partially re-touched in the prior redesign pass) against the Apple-gradient mobile `theme.ts`, not Reconcile. Notably, `BalanceRow.tsx`/`SettleUpSheet.tsx`'s *existing* interaction shape (avatar + signed amount + arrow-between-avatars preview) is already structurally close to what `SettleUp.jsx`'s reference wants — the gap is almost entirely tokens (palette, tabular-nums, radius, shadow policy) plus the missing net-position hero and count-to-zero confirmation animation, not a rebuild-from-zero the way `DashboardPage`/personal `ExpensesPage` need. **Needs amendment:** re-scope theme consumption to Reconcile tokens; add the net-position hero + count-to-zero moment to `SettleUpSheet` to match the reference prototype's "settling" stage. |
| TS-GRP-110 (push notifications) | No | — | Notification payload/registration, no rendered UI surface of its own beyond OS-level push banners. |
| TS-GRP-111 (feature flag/rollout) | No | — | Flag plumbing/e2e, not a design surface. |

**Summary:** 107, 108, and 109 are the three tickets whose "Files it will touch" and acceptance criteria need explicit amendment before Reconcile work touches their surfaces — 108 uniquely so because its acceptance criteria don't just predate Reconcile, they actively contradict it (the Dashboard "unchanged layout" clause), which makes it a product-decision blocker rather than a pure implementation-scope update like 107/109.

---

## 4. Recommended isolation boundary for a shared `reconcile-tokens` module

**Principle:** the tokens module should be exactly §9 of the Design Spec, translated to code — palette, type scale (including the new `display`/`amount`/`label` roles and mandatory tabular-nums), radius scale, spacing grid, an elevation *policy* (not just shadow values), and motion timing constants. It should contain **zero structural/layout components** (no feed row, no balance beam, no settle sheet) — those consume the tokens but are separate, larger follow-on work per §2/§3 above.

### 4.1 Web

- **Replace, not wrap, the body of `varavu_selavu_ui/src/theme.ts`.** Keep the existing exported *shape* (`getTheme(mode): Theme`, a `brand`-like or renamed token export, `withAlpha`, a default theme instance) so every consuming file's `useTheme()`/`sx` call sites need zero changes — only the values and the component-style-override bodies (`MuiPaper`, `MuiCard`, `MuiButton`, `MuiAppBar`, `MuiChip`, `MuiLinearProgress`, `MuiListItemButton`) change to stop referencing gradients/blur/hover-lift/global-pill.
  - `withAlpha` — keep as-is (generic hex→rgba helper, no Reconcile conflict).
  - `brand.gradientStart/End` and `glassCardSx()` — **delete**; Reconcile has no gradient and no frosted-glass card treatment. Replace `glassCardSx()` with a `hairlineSurfaceSx()`-equivalent (flat `surface` background, 1px `hairline` border, no blur, no shadow) for anything that currently opts into the glass treatment.
  - `motion.easing` — can likely stay as a general-purpose easing curve, but its consumers (the blanket `MuiCard` hover lift) need to lose the *policy* of applying motion everywhere, independent of the token itself surviving.
  - Add net-new exports: a `gold` ceremony token, `display`/`amount`/`label` typography roles (as reusable `sx` fragments or MUI `typography` variant additions), and a documented tabular-nums helper (`{ fontVariantNumeric: 'tabular-nums' }`) so every amount-rendering call site can opt in without repeating the raw CSS property.
  - Non-MUI consumers (inline SVG avatar gradients — though these should mostly disappear along with the gradient policy — and Plotly chart restyling per the Audit's "restyle Plotly to brand" backlog item) should get a plain token object (hex strings, not `Theme`) exported alongside the `Theme` factory, mirroring today's `gradientTokens(mode)` pattern but with Reconcile's flat palette.

### 4.2 Mobile

- **Replace, not wrap, the body of `varavu_selavu_mobile/src/theme.ts`.** Keep the exact exported surface (`ThemeColors` interface, `buildTheme(mode): AppTheme`, `AppTheme` type, `spacing`, `borderRadius`, `motion`, `lightTheme`/`darkTheme`/`theme`, `createGlobalStyles`) unchanged in shape, so every screen/component using `useAppTheme()` needs no call-site changes — only `lightColors`/`darkColors`/`buildTypography`/`buildShadows`'s internal values change.
  - `withAlpha`, `motion.spring`/`motion.springBouncy` — keep; Reconcile doesn't specify RN spring physics and these are plausible primitives for the hero-count/settle-count-to-zero animations Reconcile does call for.
  - `buildShadows()` — pare down from seven tiers to effectively a "sheets/nav only" policy (likely collapsing `xs`/`sm`/`md`/`lg` toward near-zero opacity for ordinary cards/rows, keeping a real shadow only for actual bottom-sheet/modal-equivalent surfaces).
  - `borderRadius` scale — retarget toward Reconcile's 10px-surface / 8px-control split (today's `sm:12/md:16/lg:20/xl:24` are all larger), and stop treating `full: 9999` as a general-purpose button radius — reserve it for lens/chip-equivalent controls only.
  - `buildTypography()` — add `display`/`amount`/`label` roles matching web's new roles, and thread `fontVariant: ['tabular-nums']` through every amount-rendering role (`body`/`bodyRegular` currently used for money) or, better, a dedicated `amount` role that all money-rendering components migrate to.

### 4.3 What the tokens module explicitly does **not** own (separate, later-scoped work)

- `GroupAvatar.tsx`, `SegmentedTabs.tsx`, `memberColor()`/`initialsFromName()`, `GroupCard.tsx` — component-level, consume tokens but aren't tokens.
- The day-grouped feed component (§2.1) and the True-Total-hero + lens component (§2.2) — net-new structural components per screen, not part of a tokens module, and each is its own scoped rebuild (see §2).
- `BalanceList.tsx`/`SettleUpDialog.tsx` (web) and `BalanceRow.tsx`/`SettleUpSheet.tsx` (mobile) — restyle-in-place is plausible here (their existing structure is already close to the `SettleUp.jsx` reference), but adding the net-position hero and count-to-zero confirmation animation is component-level follow-on work, not a token change.

### 4.4 Suggested sequencing

1. Ship the tokens module (web + mobile) as a like-for-like value replacement first — lowest risk, single call-site per platform (`getTheme`/`buildTheme`), and it immediately fixes the tabular-nums gap (Audit's cheapest, highest-impact item) and the gradient/glassmorphism/hover-lift/pill-everywhere violations app-wide, without touching any component's structure.
2. Only after tokens land, scope the structural rebuilds per screen (Expenses feed, Dashboard hero+lens, Groups balance-beam/settle-up) as separate efforts — each has a different blast radius and, in the Dashboard's case, an open product decision (§2.2) that should be resolved before that particular rebuild is scheduled.
