import { PaletteMode } from '@mui/material/styles';
import { gradientTokens, withAlpha, slate } from '../theme';

/**
 * TS-DES-105/208 — shared Plotly restyling helpers so every chart component pulls the same
 * Slate tokens (Inter, hairline gridlines, accent/negative/caution-tint series colors) instead
 * of Plotly's library-default qualitative palette/typeface/gridlines. Consumes `gradientTokens`
 * (TS-DES-201's flat non-Theme hex export) rather than reaching into MUI's `Theme` object, since
 * Plotly's `layout`/`data` props are plain JSON, not `sx`.
 */

const INTER_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Categorical series palette for multi-category charts (bar/sunburst/pie-equivalent).
 * Anchored on `accent` (brand) and `negative` (the other hue Slate spends on data), then
 * extended with tint/shade steps of each plus `caution` as a rare third accent — deliberately
 * not a rainbow of unrelated hues, matching the "one signature color + disciplined neutrals"
 * policy applied to data series (unchanged by TS-DES-208 — only the hex values moved from
 * Reconcile's jade/ember/gold to Slate's accent/negative/caution, via `gradientTokens`).
 */
export function categoryPalette(mode: PaletteMode): string[] {
  const t = gradientTokens(mode);
  return [
    t.primary,
    t.negative,
    withAlpha(t.primary, 0.55),
    withAlpha(t.negative, 0.55),
    t.ceremony,
    withAlpha(t.primary, 0.32),
    withAlpha(t.negative, 0.32),
    withAlpha(t.ceremony, 0.55),
  ];
}

/** Hairline gridline/axis color, dark-mode aware (Slate's `border` token). */
export function chartHairline(mode: PaletteMode): string {
  return mode === 'dark' ? slate.borderDark : slate.border;
}

/** Ink-muted text color for chart labels, ticks, and titles (Slate's `inkMuted` token). */
export function chartTextColor(mode: PaletteMode): string {
  return mode === 'dark' ? slate.inkMutedDark : slate.inkMuted;
}

/**
 * Shared Plotly `layout` fragment: Inter font, hairline gridlines, transparent paper/plot
 * background (so the surrounding MUI card supplies the surface color), no title (titles are
 * rendered as MUI `Typography` above the chart per the existing component pattern) — spread
 * this first so callers can still override/add axis-specific config.
 */
export function baseChartLayout(mode: PaletteMode) {
  const hairline = chartHairline(mode);
  const text = chartTextColor(mode);
  return {
    font: { family: INTER_STACK, color: text, size: 12 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 24, l: 48, r: 16, b: 40 },
    xaxis: {
      gridcolor: hairline,
      zerolinecolor: hairline,
      linecolor: hairline,
      tickfont: { family: INTER_STACK, color: text },
      title: { font: { family: INTER_STACK, color: text } },
    },
    yaxis: {
      gridcolor: hairline,
      zerolinecolor: hairline,
      linecolor: hairline,
      tickfont: { family: INTER_STACK, color: text },
      title: { font: { family: INTER_STACK, color: text } },
    },
    legend: { font: { family: INTER_STACK, color: text } },
  } as const;
}

/**
 * Shared Plotly `config` fragment: no modebar chrome (zoom/pan/download icons) on any chart
 * instance per the ticket's acceptance criteria — every chart in this file tree opts into this
 * rather than leaving `displayModeBar` unset (which defaults to showing it on hover).
 */
export const baseChartConfig = {
  displayModeBar: false,
  responsive: true,
} as const;
