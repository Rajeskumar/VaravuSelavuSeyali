# TrackSpense — UX Audit & Applied Redesign Spec

> **For:** Rajesh (founder/engineer), Cerebroos
> **Subject:** Live app at https://expense.cerebroos.com (web) + the React Native/Expo mobile app
> **Companion to:** *TrackSpense — UX Design Specification* (the "Reconcile" design language). This document is the **audit**: what's on the screen today, what's wrong, and the ranked fixes. It reuses the Reconcile tokens rather than re-deriving them.

---

## 1. Method — what was actually inspected

Being precise so you can weight the findings correctly:

- **Confirmed live** by fetching the production URL: the web app is a Create React App single-page app that ships a JS-gated shell (`"You need to enable JavaScript to run this app."`). Two things are directly observable from the served document and are real (small) issues in their own right — see §2.
- **Reconstructed from the codebase-level spec you provided:** the current visual system (`theme.ts` tokens), the route/screen map, the component inventory, the chart libraries, and the list/card patterns. This is the actual implementation, documented by you, so the current-state teardown in §3 is grounded, not guessed.
- **Not done:** a live click-through. This environment has no headless browser or login, so no account was created and no rendered screens were captured. Anywhere I describe a *visual outcome* (e.g., "the AppBar reads as generic glassmorphism"), it's reasoned from the explicit tokens, and I've flagged it as inference. A pixel-level pass needs screenshots or a screen recording from you — see §7.

Severity scale used below: **S1** = actively hurts trust/usability · **S2** = makes the app feel dated/templated · **S3** = polish.

---

## 2. Confirmed live from the production document

| Finding | Severity | Fix |
|:---|:---|:---|
| `<meta name="theme-color" content="#000000">` — the mobile browser chrome renders black, which matches neither the indigo brand nor the light `#F6F7FB` background. | S3 | Set to the brand surface (or `ink` in dark mode). One line in `public/index.html`. |
| `meta-description` is still the CRA default *"Web site created using create-react-app."* | S3 | Real description + Open Graph tags. Affects link previews and search. |
| App is fully client-rendered (CRA); the marketing **HomePage** ships no server-rendered content or meta. | S2 | For the public landing page specifically, pre-render or move to static HTML so it has real SEO/social metadata and first-paint content. The authenticated app can stay a SPA. |
| No visible first paint before JS boots (blank until bundle loads). | S3 | A lightweight inline splash (logo + `paper` background) in `index.html` avoids the white flash. |

These are cheap and worth doing, but they're not the story. The story is §3.

---

## 3. Current-state teardown (from the documented implementation)

### 3.1 The global visual system — the root problem

The tokens define the exact "template SaaS" look the redesign needs to leave:

- `primary #4F46E5` indigo + `secondary #14B8A6` teal + **AppBar gradient** `linear-gradient(135deg, rgba(79,70,229,.7), rgba(20,184,166,.7))` → **S2.** Indigo→teal gradient is the single most common AI/SaaS-starter palette. It signals "template," not "product with a point of view."
- **`borderRadius: 12px` globally** + **glassmorphism** `backdrop-filter: blur(12px)` on Paper, AppBar, and Drawer → **S2.** Uniform radius + blur on every surface removes hierarchy: a nav bar, a data card, and a modal all read at the same "weight," so nothing leads.
- **Card hover** `translateY(-2px)` on everything → **S2.** Motion applied uniformly is motion that means nothing. Lifting a *data* card on hover implies it's a button.
- **Inter/Roboto**, no distinct display or numeric treatment → **S2.** No tabular figures called out anywhere, which means transaction amounts almost certainly don't align on the decimal (see §3.3).

**Net effect (inference from tokens):** every screen is the same rounded, blurred, gradient-topped card surface. The app has no signature — which is exactly the complaint in your own brief.

### 3.2 Dashboard (`DashboardPage`)

**Now:** "main dashboard with metrics" composed of MUI cards/widgets (per the component inventory: `components/dashboard/` cards + widgets). Metric card, chart card, category card, recent-transactions card — all the same shape and elevation.
**Issues:**
- **S1 (for the Groups future):** there is no structural home for "My Share / I Paid / Group Total." Adding Groups to a card-grid dashboard means *more cards*, compounding the monotony.
- **S2:** no single focal number. The eye has 4+ equal landing spots. A finance home screen should answer one question first ("what did I spend") before offering detail.

### 3.3 Expenses list (`ExpensesPage`)

**Now:** paginated table (30/page, date-desc) with column headers (Date · Description · Category · Cost), CRUD via forms.
**Issues:**
- **S1:** spreadsheet table is the most dated surface in the app and the worst offender on mobile (columns truncate or force horizontal scroll). Budgeting products that win in 2026 explicitly *don't* look like spreadsheets.
- **S1:** without tabular numerals, the `Cost` column doesn't align on the decimal — a small thing that continuously undermines "this app is precise with my money."
- **S2:** pagination ("page 2 of N") is a spreadsheet-era pattern; a chronological feed with infinite scroll + sticky date headers fits money-over-time far better.
- **S2:** editing is a separate form round-trip rather than inline/sheet-based.

### 3.4 Expense Analysis (`ExpenseAnalysisPage`)

**Now:** Plotly charts (bar/line/donut) + category breakdown + drill-down list; results cached 60s.
**Issues:**
- **S2:** default Plotly styling is generic and heavy (its default fonts, tooltips, and modebar don't match any brand). It reads as "a charting library," not "TrackSpense."
- **S2:** donut-led category view doesn't scale — a donut with 7 main + 44 sub-categories becomes unreadable. Ranked bars scale; donuts don't.
- **S2:** charts show *what* but not *what changed*. No narrative/anomaly layer, which is where the category is heading (data storytelling).

### 3.5 AI Analyst (`AIAnalystPage`)

**Now:** a separate chat tab; injects analysis JSON as context; model picker.
**Issues:**
- **S2:** chat is walled off in its own route. The data screens and the "ask about the data" surface never touch, so the AI feels bolted on rather than woven in. The opportunity: summon it *from* the analysis/feed with the current scope pre-loaded.
- **S3:** exposing raw model names (`gpt-5-mini`, etc.) in the picker leaks implementation at the user. Name them by behavior ("Fast" / "Deep") if the picker stays.

### 3.6 Recurring (`RecurringPage` + `RecurringPrompt`)

**Now:** template list; auto-prompt modal on login when items are due.
**Assessment:** This is the one place the **card pattern is correct** — recurring templates are discrete objects, not a stream. Keep cards here; just restyle them to the new system. The login auto-prompt is a good instinct (proactive), but as a **blocking modal** it interrupts; make it a dismissible bottom sheet / inline banner (**S3**).

### 3.7 Mobile app (RN/Expo)

**Now:** bottom tabs (Home · History · Add`＋` · Stats · AI Chat) + drawer; `react-native-chart-kit`; `CategoryDonutChart`, `TrendLineChart`, `Card`, `Toast`, `SkeletonLoader`.
**Assessment:**
- **Good bones:** the center `＋` Add tab in the thumb zone, `SkeletonLoader` (skeletons > spinners), and `Toast` are all correct 2026 patterns. Keep them.
- **S2:** `react-native-chart-kit` defaults are visually basic; the donut has the same scaling problem as web.
- **S2:** History screen mirrors the web table's row model instead of using a native `SectionList` day-grouped feed with swipe actions — the pattern RN is *best* at.
- **Opportunity:** the drawer + tabs already give you the structure; the redesign is mostly restyle + swapping History's list model + folding chat into data screens, not an architecture change.

---

## 4. Heuristic summary — ranked by impact × effort

| # | Issue | Severity | Effort | Priority |
|:--|:---|:---:|:---:|:---:|
| 1 | Expense **table → day-grouped feed** (web + mobile) | S1 | M | **Do first** |
| 2 | **Tabular numerals** on every amount | S1 | XS | **Do first** |
| 3 | Dashboard **card-grid → True Total + lens** (unblocks Groups) | S1 | M | **Do first** |
| 4 | Retire **indigo→teal gradient + uniform glassmorphism** → Reconcile palette | S2 | M | High |
| 5 | Add a **display typeface** (Clash Display) for hero numbers | S2 | S | High |
| 6 | **Restyle Plotly / chart-kit** to brand; donut → ranked spectrum | S2 | M | High |
| 7 | **Fold AI chat into data views** (scoped "Ask") | S2 | M | Medium |
| 8 | Uniform `translateY` hover → **elevation reserved for sheets only** | S2 | S | Medium |
| 9 | Recurring prompt: blocking modal → **dismissible sheet** | S3 | S | Medium |
| 10 | `theme-color`, meta description, OG tags, splash | S3 | XS | Quick win |

---

## 5. Applied redesign — per screen, "now → change to"

Using the **Reconcile** tokens (restated compactly so this doc stands alone):
`ink #191A1E` · `ink-muted #6B6D74` · `paper #F7F7F4` · `surface #FFFFFF` · `hairline #E4E4DF` · signature `jade #0FA37F` · `ember #DE5B4B` (owe/over) · `gold #C9973F` (reconcile moment only). Display: **Clash Display**; Body: **Inter**; Amounts: **Inter `tabular-nums`**. Radius: 10px surfaces / pill controls. Elevation: sheets only.

**Theme (`theme.ts`) — the highest-leverage single change.**
Replace the indigo/teal palette and the gradient AppBar with a flat `paper` background and an `ink` top bar (no gradient, no blur). Drop global `backdrop-filter`. Keep radius at 10px, remove the universal `translateY` hover. This one file shifts the whole app off "template."

**Dashboard.** Card grid → one **True Total** in Clash Display (upper third) + a segmented **My Share / I Paid / Group Total** lens that re-scopes that number, with a soft count animation. Below: one ranked spectrum bar, a slim "My Groups" strip, the unified feed. Delete the metric-card wall.

**Expenses.** Table + pagination → **day-grouped feed**: sticky date headers with a daily subtotal; rows = tint dot · merchant · category · right-aligned tabular amount (ink). Mobile: `SectionList` + `Swipeable` (gesture-handler) for edit/delete/split; tap → detail **bottom sheet** with inline edit. Web: hover-reveal actions + keyboard nav; offer a compact-table *opt-in* for power users.

**Analysis.** Donut-led → **ranked spectrum** default; add a **"what changed" rail** (sentence-first insight tiles with sparklines) at the top; on web, a **Sankey** "where money goes" as the signature view (Plotly supports it natively; mobile falls back to the spectrum). Restyle all Plotly to brand: Inter font, `hairline` gridlines, no modebar, jade/ember series.

**AI Analyst.** Keep the tab, but add a summonable **"Ask" sheet** from the feed/analysis that inherits the current scope, plus "Ask why →" on each insight tile. Rename model picker options by behavior.

**Item / Merchant Insights.** Render itemized detail as a **receipt tape** (monospaced, vertical) + per-item **price history** with store chips. Merchant view = header stat + item tape + one "what changed here" tile.

**Recurring.** Keep cards (correct here) — restyle to Reconcile, add a next-due chip and pause toggle. Convert the login prompt from blocking modal to dismissible sheet.

**Groups (new).** Group hero = *your net position*; balances = **balance beam + directional list** (jade owed-to-you `+`, ember you-owe `−`, always with words); settle-up = bottom-sheet **minimal-transaction plan** with a count-to-zero on confirm.

---

## 6. Prioritized fix backlog

**Quick wins (a day, mostly cosmetic but high perceived-quality lift)**
1. Tabular numerals on all amounts (`font-variant-numeric: tabular-nums` / RN `fontVariant`).
2. `theme-color`, real meta description, OG tags, inline splash.
3. Remove universal `translateY` hover; reserve elevation for sheets.
4. Rename AI model picker by behavior.

**Structural, sequenced (the real redesign)**
5. Ship the Reconcile `theme.ts` (palette + type + radius) behind a flag; migrate screen by screen.
6. Add Clash Display for hero numerals; wire the Dashboard **True Total + lens**.
7. Rebuild Expenses as the **day-grouped feed** (web + mobile) — the biggest single UX win.
8. Rework Analysis: ranked spectrum + "what changed" rail + branded charts; Sankey on web.
9. Fold AI chat into data views (scoped Ask).
10. Build Groups on the balance-beam / settle-up sheet patterns from the start, on the new tokens.

---

## 7. What still needs a visual pass

I audited the implementation, not the pixels. To turn this into a pixel-level redline I'd want, from you, any of: screenshots of Dashboard, Expenses, Analysis, and the AI Analyst (web and mobile), or a short screen recording of adding one expense and viewing analysis. With those I can mark up specific spacing, contrast, and hierarchy problems on the actual rendered screens rather than reasoning from tokens — and confirm the inferences flagged in §3.

Fastest way to judge the direction, though, is still to prototype the two highest-leverage patterns — the **day-grouped feed** and the **settle-up sheet** — as live React artifacts and react to them, rather than to more spec on paper.
