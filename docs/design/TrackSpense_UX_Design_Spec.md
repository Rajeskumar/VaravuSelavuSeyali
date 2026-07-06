# TrackSpense — UX Design Specification

> **For:** Rajesh (founder/engineer), Cerebroos
> **Scope:** Web (React + TypeScript + MUI v7) and Mobile (React Native + Expo, iOS/Android)
> **Purpose:** A hand-to-engineer design direction that replaces the current "admin-dashboard-of-cards-and-tables" look with one opinionated, cross-platform design language — sized for real data and for the new Groups feature.
> **Status:** Direction v1. Research-grounded (2025–2026 consumer fintech). Implementable without exotic native modules.

---

## 0. The one-paragraph thesis

TrackSpense is not a budgeting dashboard and not a Splitwise clone. It is a **reconciliation instrument**: the only place that answers *"how much did I actually spend this month — mine and my share of everyone's — in one number."* The entire design should serve that single truth. Where Copilot Money made budgeting *beautiful* and Cleo made it *conversational*, TrackSpense's territory is **unification** — personal and group spend collapsed into one honest ledger. The design language is therefore quiet, ink-dominant, and numeral-first, with exactly one signature moment: the combined **True Total**. Everything else stays disciplined so that number can be loud.

---

## 1. Design principles (five stated opinions)

**1. One true number, many lenses — never many numbers.**
The combined dashboard must resist the reflex to add a card for "My Share," another for "I Paid," another for "Group Total." That is how the current app became monotonous. Instead there is *one* headline amount and a **lens switch** that re-scopes it. Three cards is three questions the user has to reconcile in their head; one number with a lens is an answer.

**2. Numbers are the product; color is punctuation.**
Most amounts render in ink, not color. Green and red are reserved for *direction and state* (you're owed / you owe / over budget), never applied to every figure. This is deliberate: reserving red for genuine attention and keeping the field neutral is what separates a trustworthy finance UI from an alarming one. Tabular figures are non-negotiable — misaligned decimals in a transaction list quietly erode trust.

**3. Kill the spreadsheet. Feeds and receipts, not grids.**
The transaction table is the single most dated surface in the app. Replace it with a **day-grouped feed** that reads like a chronological story, and render itemized receipts as an actual **receipt tape**, not a sub-table. The vernacular of the subject (receipts, ledgers, tender) is where the app's identity comes from — lean into it instead of into generic MUI cards.

**4. Chat is a layer, not a room.**
Cleo's strength is conversation; its weakness is that conversation is *all* it is, with no data to stand on. TrackSpense already has the data. So the AI Analyst should be summonable *from inside* any data view — carrying the current scope and filter into the question — plus inline "explain this" affordances on insights. The standalone chat tab stays, but it is the fallback, not the main event.

**5. Spend boldness once.** The palette is restrained, the motion is restrained, elevation is rare. All the personality is concentrated in the display typeface and the True Total reveal. A design that is bold everywhere reads as bold nowhere — and, increasingly, reads as machine-generated.

---

## 2. Color system — palette "Reconcile"

The current indigo/teal glassmorphism is the generic "dashboard SaaS" tell. The move that top consumer fintech makes is to own *one* defensible color as brand territory (Monzo's Hot Coral, Wise's bright green, Cash App's green) and let everything else be a disciplined neutral system. Reconcile does that, and — critically — keeps the **brand color separate from the semantic money colors** so a green number never has to mean two things.

| Token | Hex | Role |
|:---|:---|:---|
| `ink` | `#191A1E` | Primary text, nav, and **all neutral spend amounts**. Also the dark-mode background. |
| `ink-muted` | `#6B6D74` | Secondary text, metadata, timestamps, captions |
| `paper` | `#F7F7F4` | App background. A cool-warm neutral — deliberately *not* cream (cream + serif is a design-cliché tell) and not stark white. |
| `surface` | `#FFFFFF` | Elevated surfaces (sheets, the few real cards). Dark mode: `#202127`. |
| `hairline` | `#E4E4DF` | Dividers, borders, chart gridlines. Replaces most drop shadows. |
| **`jade`** | **`#0FA37F`** | **Signature.** Brand identity, primary actions, active states, *and* the positive semantic (income / owed-to-you / under budget). |
| `ember` | `#DE5B4B` | Negative semantic: you owe, over budget, failed states. Used sparingly. |
| `gold` | `#C9973F` | **Ceremony only.** The True Total reconcile tick, streaks, receipt-parse success. Jewelry, not paint — never a background fill. |

**Usage rules**

- **Ink is the default for money.** A $42.10 grocery spend is ink, not red. Coloring every expense red is fatiguing and meaningless when everything is an expense.
- **Jade does double duty on purpose.** It is both "the brand" and "positive," which works *because* positive money and brand energy are the same feeling. The risk (is this green because it's positive or because it's a button?) is resolved by **position and shape**: jade as a filled pill = action; jade as a signed number = positive amount. Never a jade-filled number.
- **Ember is rationed.** Reserve it for debt ("you owe Ana $18") and threshold breaches. If half the screen is ember, the system has failed.
- **Gold appears maybe twice per session.** It marks the moment something *reconciles*. Its scarcity is the point.
- **Dark mode is a first-class requirement, not a toggle-later.** In 2026 it is expected, not a differentiator. `ink` → background, `surface` → `#202127`, jade/ember lift ~8% luminance for contrast.
- **Accessibility floor:** every text/background pair ≥ 4.5:1 (jade `#0FA37F` on paper passes for ≥16px/bold; use `#0B8A6B` for jade text on light at small sizes). Never encode owe/owed by color alone — always pair with sign (`+`/`−`) and a word.

---

## 3. Typography system

The current Inter/Roboto stack is the "hasn't-invested-in-distinction" default. Commissioned type (Söhne, Coinbase Sans, etc.) is out of scope for a solo build, but the *effect* — a characterful display face used with restraint over a clean numeric-strong body — is fully achievable with free faces.

| Role | Face | Notes |
|:---|:---|:---|
| **Display** | **Clash Display** (Fontshare, free) | Engineered, geometric, confident. Used *only* for the True Total, big balances, and section moments. This is the personality. Fallback: **Space Grotesk** if you want a lighter footprint. |
| **Body / UI** | **Inter** (keep it) | Neutral, screen-optimized, trustworthy. Everything that isn't a hero number or a heading. |
| **Numeric** | **Inter with `tabular-nums`** | All amounts. One family, tabular figures via OpenType — no third font needed. Upgrade path: **Manrope** for the numeric role specifically; its numerals are exceptional for financial data. |

**Scale (mobile base 16px / desktop 16px, 1.25 ratio):**

| Token | Size / Weight | Use |
|:---|:---|:---|
| `display-hero` | 44–56px Clash 600, tabular | The True Total |
| `display` | 32px Clash 600 | Screen balances, big stats |
| `title` | 20px Inter 600 | Section titles, sheet headers |
| `body` | 16px Inter 400/500 | Default |
| `amount` | 16–18px Inter 600 **tabular-nums** | Every figure in a list |
| `meta` | 13px Inter 500, `ink-muted` | Dates, categories, counts |
| `label` | 11px Inter 600, +6% tracking, uppercase | Eyebrows, lens labels — used only where a label genuinely labels |

**Rules:** amounts always `font-variant-numeric: tabular-nums` (web) / `fontVariant: ['tabular-nums']` (RN). Currency symbol and decimals set ~2px smaller and `ink-muted` so the significant digits lead. Never letterspace body text; reserve tracking for the 11px labels.

---

## 4. Layout & data-display patterns (the replacements)

This is the core of the redesign. Each pattern names what it replaces and why.

### 4.1 Expense table → **Day-grouped ledger feed**

The reference point is Copilot/Monarch: a chronological stream, not a grid. No column headers.

```
┌─────────────────────────────────────────┐
│  TODAY                          −$63.40  │  ← sticky section header + day subtotal
│  ● Trader Joe's      Groceries   −$42.10 │  ← tint dot · merchant · category · tabular amt
│  ● Shell             Gas/fuel    −$21.30 │
│                                          │
│  YESTERDAY                      −$118.00 │
│  ◐ Dinner — split 4       your share −$29.50 │ ← group rows show YOUR SHARE inline, half-moon glyph
│  ● Netflix           Subscription −$15.99│
└─────────────────────────────────────────┘
```

- **Row = tap target.** Left: a category **tint dot** (or merchant monogram/logo glyph). Middle: merchant name (title) + category (meta). Right: **tabular amount**, ink for personal, with a small `◐` glyph and "your share" tag when it's a group expense.
- **Section header carries the daily subtotal** — the running-total context Copilot users value, without a totals column.
- **Mobile gestures:** swipe-left → Edit / Delete / Split; swipe-right → quick re-categorize. Implement with `react-native-gesture-handler` `Swipeable` (ships with Expo) in a `SectionList` (native day grouping, virtualized for hundreds of rows).
- **Web:** trailing hover-reveal action buttons; keyboard up/down to move between rows, `E` to edit (Copilot-style power-user affordance). Offer a **compact table view** as an opt-in secondary density for desktop power users who genuinely want columns.
- **Tap → detail bottom sheet** (§5), not a route change.

### 4.2 Insight card → **Narrative "what changed" rail**

The current generic shadowed cards become **sentence-first insight tiles** in a horizontally-scrollable story rail. The 2026 shift is from *data visualization* to *data storytelling* — a chart shows where money went; a story tells you how your habits changed.

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Dining is up 32% │ │ New merchant:    │ │ Eggs cost 18%    │
│ vs last month    │ │ Sephora — $94    │ │ more than your   │
│  ▁▂▄▆█  ↗         │ │  first time here │ │ usual  ▂▂▃▅  ↗   │
│  Ask why →        │ │  Categorize →    │ │  See history →   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

- Each tile leads with a **plain-language claim**, backed by a sparkline (react-native-svg / a tiny Plotly trace on web), and ends with **one action** — including "Ask why →", which opens the AI sheet pre-loaded with that question. This is where chat fuses into data.
- No drop shadows. Differentiate with a 1px `hairline`, a faint category tint wash, and type hierarchy. Elevation is spent only on sheets.

### 4.3 Category breakdown → **Ranked spectrum + flow**

Demote the donut. Lead with a **proportional stacked "spectrum" bar** + a **ranked list with inline micro-bars**:

```
Spending this month                 $2,418
▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░
Food&Drink  ████████████  $812   34%
Home        ████████      $560   23%
Transport   ██████        $410   17%
Life        ████          $286   12% ...
```

- Ranked rows are scannable and scale to real data; the donut becomes a small glanceable ornament, not the main event.
- **Signature analytical view: a Sankey flow** ("where the money goes" — income → categories → merchants). GoodShare uses exactly this to differentiate from Splitwise, and Plotly (already in your web stack) has a native Sankey trace. **Mobile falls back to the ranked spectrum** — Sankey is illegible on a phone; don't force it.

### 4.4 Item-level detail → **Receipt tape + price history**

Lean all the way into the receipt vernacular. Item Insights and receipt detail render as a **vertical monospaced tape**, not a table:

```
  TRADER JOE'S · 03/14/2026
  ─────────────────────────
  Bananas        1.2 lb   2.34
  Oat Milk        ×2       7.98
  Eggs, dozen     ×1       4.49  ↑ 18%
  ─────────────────────────
  Subtotal               42.10
```

- Per-item **price history** is a small line chart with **store chips** underneath (which store, what you paid) — the "is this cheaper at X?" answer. This is a genuine differentiator: none of the major free split apps do item-level intelligence.

### 4.5 Group balance view → **Balance beam + directional list**

Splitwise's balance screen is the thing people call "cluttered and dated." Replace it with a calm hierarchy:

```
        You are owed
         +$46.20             ← net position, display face, jade
   ────────────────────
   ● Ana        owes you   +$28.00
   ● Marco      owes you   +$18.20
   ◐ You owe Priya         −$12.00   ← ember, with sign + words
```

- One **net position** up top (the "am I up or down" answer), then a signed, avatar-led list. Green with `+` for owed-to-you, ember with `−` and the word "owe" for debts — color never carries the meaning alone.
- **Settle-up** is a bottom-sheet flow that surfaces the **minimal-transaction plan** from your debt-simplification algorithm ("Pay Priya $12 → all square"), with a satisfying count-to-zero animation on confirm. Settlement optimization is table-stakes now; the design job is to make the *result* feel like relief.

### 4.6 Combined dashboard → **True Total + lens switch**

The answer to "how do I show My Share / I Paid / Group Total without three cards":

```
┌───────────────────────────────────────┐
│  March · everything                    │
│                                        │
│         $2,418.60                       │  ← display-hero, tabular. THE number.
│      ───── reconciled ─────  ✓(gold)   │  ← the one gold moment
│                                        │
│   [ My Share ] [ I Paid ] [ Group ]     │  ← segmented lens; re-scopes the SAME number
│                                        │
│   ▓▓▓▓▓▓▓▓░░░░  spectrum                 │
│   My Groups · 3 active     Recent feed  │
└───────────────────────────────────────┘
```

- The **lens control** swaps the meaning of the hero number and everything below it, with a quick cross-fade + count animation. One number, three truths, zero clutter. This is the structural fix for the "everything is a card" problem: the dashboard is a *viewer over one dataset*, not a wall of widgets.

---

## 5. Interaction & motion (per surface)

**Global**
- **Bottom sheets over modals** on mobile (`@gorhom/bottom-sheet`, Expo-friendly); on web, MUI `Drawer anchor="bottom"` for mobile widths, right-side panel for desktop (the Copilot side-panel pattern). Primary actions live in the **thumb zone** — bottom third of the screen.
- **Progressive disclosure:** feed row → detail sheet → full edit. Never dump everything at once.
- **`prefers-reduced-motion` respected everywhere.** Motion is opt-out-able and never blocks a task.

**List:** swipe actions (mobile) / hover-reveal (web). Reordering and inserts use a 150ms fade+slide, not a bounce.

**Detail sheet:** inline edit in place — tap a field, edit, done. No separate edit screen.

**Chat / AI Analyst:** a summonable **"Ask" sheet** reachable from any data view via a persistent small affordance; it inherits the current scope (year/month/group/filter) so "how much on this?" just works. Plus per-insight "Ask why →". The dedicated tab remains for open-ended sessions. Stream tokens; show a typing indicator; keep TrackSpense's voice consistent (helpful, plain — not Cleo's roast persona unless you deliberately want that brand).

**Receipt capture — the earned motion moment:** as the OCR parses, **line items animate in one by one** as they're recognized, then the total lands with a soft gold tick. This is the one place to spend animation budget; it turns a loading spinner into a moment of confidence. (Everything else: skeletons, not spinners.)

**Settle-up:** the balance **counts down to $0.00** on confirmation. Small, single, meaningful.

---

## 6. Screen-by-screen recommendations

| Screen | Direction |
|:---|:---|
| **Dashboard** | True Total hero + lens switch (§4.6). Below: spectrum bar, "My Groups" strip, unified recent feed. Kill the widget grid. |
| **Expenses list** | Day-grouped ledger feed (§4.1) with swipe actions and sticky day subtotals. Compact-table opt-in on web. |
| **Expense Analysis** | Ranked spectrum (§4.3) as default; Sankey flow on web as the signature analytical view; "what changed" rail (§4.2) at top. Retire the donut-first layout. |
| **Item Insights** | Receipt-tape detail + per-item price history with store chips (§4.4). |
| **Merchant Insights** | Merchant header (lifetime spend, visit count, monthly sparkline) → the merchant's item tape → "what changed here" tile. |
| **AI Analyst** | Keep the tab, but make chat *ambient* (§5): summonable sheet + inline "Ask why". Scope-aware prompts. |
| **Recurring** | These are the exception where a **card grid is correct** — recurring templates are discrete objects, not a stream. Use small ledger-styled cards with a next-due date, day-of-month chip, and pause toggle. |
| **Groups — dashboard** | Group hero = *your net position in this group*; feed of group expenses showing your share inline. |
| **Groups — balances** | Balance beam + directional list (§4.5). |
| **Groups — settle-up** | Bottom-sheet minimal-transaction plan + count-to-zero. |

---

## 7. Before / after (in words)

**Expense list — before:** a spreadsheet-style table with column headers (Date, Description, Category, Cost), uniform rows, MUI shadows, pagination. It reads like an admin export. On mobile the columns cramp and truncate.

**Expense list — after:** a scrollable ledger. Bold day headers ("TODAY −$63.40") anchor a stream of tappable rows — category tint dot, merchant, category, and a right-aligned tabular amount in ink. Group expenses quietly show "your share." Swipe a row to edit, split, or re-categorize; tap it and a detail sheet rises from the bottom. No headers, no pagination chrome, no horizontal scroll. It reads like a story of the month, and the tabular numerals make the right edge a clean, scannable column of money.

**Dashboard — before:** a wall of rounded, shadowed cards — a metric card, a chart card, a top-categories card, a recent-transactions card — all the same shape, all competing, none clearly the point. Adding Groups means adding *more* cards.

**Dashboard — after:** near-empty by comparison. One enormous **True Total** in Clash Display sits in the upper third with a thin "reconciled ✓" tick in gold. A segmented **My Share / I Paid / Group Total** lens sits under it and re-scopes that single number with a soft count animation. Below, one spectrum bar, a slim "My Groups" strip, and the unified feed. The eye has exactly one place to land, and the answer to "what did I actually spend" is the biggest thing on the screen.

---

## 8. Open trade-offs & risks

1. **Feeds use more vertical space than tables.** Mitigation: sticky day headers, a density toggle, `SectionList`/virtualized rows so hundreds of transactions stay smooth, and the web compact-table opt-in for power users who think in columns (some Copilot users genuinely prefer the dense grid).
2. **Clash Display cost/perf.** It's a display face — subset to the glyphs you use, load `font-display: swap`, and only apply it to hero numerals/headings. If bundle size on mobile bites, fall back to Space Grotesk and lose little.
3. **Sankey doesn't fit a phone.** Accepted: it's a web-only signature; mobile gets the ranked spectrum. Don't ship an unreadable Sankey to look clever.
4. **One-color conviction can go monotone.** The discipline (ink-dominant, jade only on interaction/positive, gold rationed) is what prevents it — but it *requires* the discipline. If jade starts appearing everywhere, the identity dilutes.
5. **Color-encoded owe/owed is an a11y trap.** Always pair with sign and word; test with a protanopia simulator. This is a rule, not a nicety.
6. **Ambient chat can feel gimmicky if under-powered.** The "Ask why" affordance is only worth it if the analyst reliably answers scoped questions. If the model can't, hide the affordance rather than disappoint — a broken shortcut erodes more trust than an absent one.
7. **Two platforms, one language.** The shared tokens (color, type, spacing) port cleanly; the *interactions* must diverge honestly — swipe/bottom-sheet/thumb-zone on mobile, hover/side-panel/keyboard on web. Don't force web to mimic mobile gestures or vice versa.

---

## 9. Token starter (for the build conversation)

```
color:   ink #191A1E · ink-muted #6B6D74 · paper #F7F7F4 · surface #FFFFFF
         hairline #E4E4DF · jade #0FA37F (text-safe #0B8A6B) · ember #DE5B4B · gold #C9973F
type:    display Clash Display 600 · body Inter 400/500/600 · amounts Inter tabular-nums
         (numeric upgrade: Manrope)
radius:  10px surfaces · 8px controls · pill (999px) for lens + action chips
         (down from the flat 12px-everywhere)
space:   4pt grid; 16px screen gutters mobile / 24px web
elevation: reserved for sheets only; everything else uses hairline + tint
motion:  150ms fades/slides; count animations on hero + settle; reduced-motion honored
signature: the True Total reveal — display-face number + lens switch + gold reconcile tick
```

---

*Next step: take this into a build conversation and translate §9 into an MUI v7 theme + a shared token module for RN. Two patterns are worth prototyping first as React artifacts before committing — the day-grouped feed and the settle-up sheet — since they're faster to judge live than on paper.*
