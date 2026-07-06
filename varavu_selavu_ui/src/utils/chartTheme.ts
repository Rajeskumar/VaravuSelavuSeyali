import { PaletteMode } from '@mui/material/styles';
import { gradientTokens, withAlpha } from '../theme';

/**
 * TS-DES-105 — shared Plotly restyling helpers so every chart component pulls the same
 * Reconcile tokens (Inter, hairline gridlines, jade/ember/category-tint series colors) instead
 * of Plotly's library-default qualitative palette/typeface/gridlines. Consumes `gradientTokens`
 * (TS-DES-101's flat non-Theme hex export) rather than reaching into MUI's `Theme` object, since
 * Plotly's `layout`/`data` props are plain JSON, not `sx`.
 */

const INTER_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Categorical series palette for multi-category charts (bar/sunburst/pie-equivalent).
 * Anchored on jade (brand/primary) and ember (the only other hue Reconcile spends), then
 * extended with tint/shade steps of each plus gold as a rare accent — deliberately not a
 * rainbow of unrelated hues, matching Design Spec §2's "one signature color + disciplined
 * neutrals" policy applied to data series.
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

/** Hairline gridline/axis color, dark-mode aware (Design Spec §2/§9 hairline tokens). */
export function chartHairline(mode: PaletteMode): string {
  return mode === 'dark' ? '#33343B' : '#E4E4DF';
}

/** Ink/paper text color for chart labels, ticks, and titles. */
export function chartTextColor(mode: PaletteMode): string {
  return mode === 'dark' ? '#9A9CA3' : '#6B6D74';
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
