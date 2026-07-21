import { PaletteMode } from '@mui/material/styles';
import { gradientTokens, withAlpha, cerebroTokens } from '../theme';

/**
 * Shared Plotly restyling helpers so every chart component pulls the same CerebroOS tokens
 * (Instrument Sans, hairline gridlines, violet/negative/caution-tint series colors) instead of
 * Plotly's library-default qualitative palette/typeface/gridlines. Consumes `gradientTokens`/
 * `cerebroTokens` (theme.ts's flat non-Theme hex exports) rather than reaching into MUI's `Theme`
 * object, since Plotly's `layout`/`data` props are plain JSON, not `sx`. Every function takes an
 * explicit `PaletteMode` (default `'dark'` for any caller that hasn't been updated to pass one).
 */

const BODY_STACK = "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Categorical series palette for multi-category charts (bar/sunburst/pie-equivalent).
 * Anchored on `primary` (violet brand accent) and `negative`, then extended with tint/shade
 * steps of each plus `caution` as a rare third accent — deliberately not a rainbow of unrelated
 * hues, matching the "one signature color + disciplined neutrals" policy applied to data series.
 */
export function categoryPalette(mode: PaletteMode = 'dark'): string[] {
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

/** Hairline gridline/axis color (CerebroOS surface-border token). */
export function chartHairline(mode: PaletteMode = 'dark'): string {
  return cerebroTokens(mode).surfaceBorder;
}

/** Muted text color for chart labels, ticks, and titles (CerebroOS `textSecondary` token). */
export function chartTextColor(mode: PaletteMode = 'dark'): string {
  return cerebroTokens(mode).textSecondary;
}

/**
 * Shared Plotly `layout` fragment: Instrument Sans font, hairline gridlines, transparent
 * paper/plot background (so the surrounding MUI card supplies the surface color), no title
 * (titles are rendered as MUI `Typography` above the chart per the existing component pattern)
 * — spread this first so callers can still override/add axis-specific config.
 */
export function baseChartLayout(mode: PaletteMode = 'dark') {
  const hairline = chartHairline(mode);
  const text = chartTextColor(mode);
  return {
    font: { family: BODY_STACK, color: text, size: 12 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 24, l: 48, r: 16, b: 40 },
    xaxis: {
      gridcolor: hairline,
      zerolinecolor: hairline,
      linecolor: hairline,
      tickfont: { family: BODY_STACK, color: text },
      title: { font: { family: BODY_STACK, color: text } },
    },
    yaxis: {
      gridcolor: hairline,
      zerolinecolor: hairline,
      linecolor: hairline,
      tickfont: { family: BODY_STACK, color: text },
      title: { font: { family: BODY_STACK, color: text } },
    },
    legend: { font: { family: BODY_STACK, color: text } },
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
