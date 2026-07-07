import { AppTheme, withAlpha } from '../theme';

/**
 * TS-DES-105 — shared react-native-chart-kit restyling helpers, mirroring the web equivalent
 * (`varavu_selavu_ui/src/utils/chartTheme.ts`). chart-kit doesn't expose real gridlines the way
 * Plotly does (only `propsForBackgroundLines`), so "hairline gridlines" here means using the
 * theme's hairline/border color at a thin stroke width rather than chart-kit's solid default.
 */

/**
 * Categorical series palette for multi-category charts (donut/pie), anchored on jade (primary)
 * and ember (error), matching the web categoryPalette's "one signature color + disciplined
 * neutrals" policy rather than a rainbow of unrelated hues.
 *
 * Returned as plain hex (never pre-mixed with `withAlpha`'s `rgba(...)` output) so callers can
 * safely apply their own alpha pass on top (e.g. a lighter "subcategory" ring) without double-
 * processing an already-rgba string.
 */
export function categoryHexPalette(theme: AppTheme): string[] {
  const { primary, error, gold } = theme.colors;
  return [primary, error, gold];
}

/** Same palette, pre-mixed with alpha tiers for direct use as chart series colors. */
export function categoryPalette(theme: AppTheme): string[] {
  const base = categoryHexPalette(theme);
  return [
    base[0],
    base[1],
    withAlpha(base[0], 0.55),
    withAlpha(base[1], 0.55),
    base[2],
    withAlpha(base[0], 0.32),
    withAlpha(base[1], 0.32),
    withAlpha(base[2], 0.55),
  ];
}

/** Shared chart-kit `chartConfig` fragment: Inter font, hairline gridlines, jade series color. */
export function baseChartConfig(theme: AppTheme) {
  return {
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    color: (opacity = 1) => withAlpha(theme.colors.primary, opacity),
    labelColor: (opacity = 1) => withAlpha(theme.colors.textSecondary, opacity),
    decimalPlaces: 0,
    propsForBackgroundLines: {
      stroke: theme.colors.borderLight,
      strokeWidth: 1,
      strokeDasharray: '0',
    },
    propsForLabels: {
      fontFamily: 'Inter-Medium',
      fontSize: 11,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: theme.colors.primary,
      fill: theme.colors.surface,
    },
    fillShadowGradientFrom: theme.colors.primary,
    fillShadowGradientTo: theme.colors.surface,
    fillShadowGradientFromOpacity: 0.2,
    fillShadowGradientToOpacity: 0,
  };
}
