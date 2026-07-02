import { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';

/** Converts a '#rrggbb' hex color to an 'rgba(r,g,b,a)' string. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primarySurface: string;
  secondary: string;
  secondarySurface: string;

  gradientStart: string;
  gradientEnd: string;

  background: string;
  surface: string;
  surfaceSecondary: string;
  surfaceElevated: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;
  textInverse: string;

  success: string;
  successSurface: string;
  error: string;
  errorSurface: string;
  warning: string;
  warningSurface: string;

  border: string;
  borderLight: string;

  highlight: string;
  overlay: string;
}

// Vibrant emerald → sky brand
const lightColors: ThemeColors = {
  primary: '#10B981',        // Emerald 500
  primaryLight: '#34D399',
  primaryDark: '#047857',
  primarySurface: '#ECFDF5',
  secondary: '#0EA5E9',      // Sky 500
  secondarySurface: '#F0F9FF',

  gradientStart: '#10B981',
  gradientEnd: '#0EA5E9',

  background: '#F7F5FC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1EEFA',
  surfaceElevated: '#FFFFFF',

  text: '#150F23',
  textSecondary: '#635E75',
  textTertiary: '#9891AA',
  textQuaternary: '#C9C4D6',
  textInverse: '#FFFFFF',

  success: '#16A34A',
  successSurface: '#E7F9EE',
  error: '#EF4444',
  errorSurface: '#FEECEC',
  warning: '#F59E0B',
  warningSurface: '#FFF4E0',

  border: '#E7E1F3',
  borderLight: '#F1EEF9',

  highlight: '#0EA5E9',
  overlay: 'rgba(0,0,0,0.4)',
};

const darkColors: ThemeColors = {
  primary: '#34D399',        // Emerald 400
  primaryLight: '#6EE7B7',
  primaryDark: '#10B981',
  primarySurface: '#064E3B',
  secondary: '#38BDF8',      // Sky 400
  secondarySurface: '#0C4A6E',

  gradientStart: '#34D399',
  gradientEnd: '#38BDF8',

  background: '#0D0B14',
  surface: '#18141F',
  surfaceSecondary: '#221D2F',
  surfaceElevated: '#241F30',

  text: '#F5F3FA',
  textSecondary: '#B4AEC4',
  textTertiary: '#847E97',
  textQuaternary: '#4E4860',
  textInverse: '#150F23',

  success: '#34D399',
  successSurface: '#123324',
  error: '#F87171',
  errorSurface: '#3A1919',
  warning: '#FBBF24',
  warningSurface: '#3A2A0E',

  border: '#2C2740',
  borderLight: '#221D30',

  highlight: '#38BDF8',
  overlay: 'rgba(0,0,0,0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 9999,
};

function buildTypography(colors: ThemeColors) {
  return {
    fontFamily: {
      regular: 'Inter-Regular',
      medium: 'Inter-Medium',
      semiBold: 'Inter-SemiBold',
      bold: 'Inter-Bold',
      black: 'Inter-Black',
    },
    h1: {
      fontFamily: 'Inter-Black',
      fontSize: 34,
      color: colors.text,
      letterSpacing: -0.5,
    },
    h2: {
      fontFamily: 'Inter-Bold',
      fontSize: 28,
      color: colors.text,
      letterSpacing: -0.3,
    },
    h3: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 22,
      color: colors.text,
      letterSpacing: -0.2,
    },
    body: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 17,
      color: colors.text,
    },
    bodyRegular: {
      fontFamily: 'Inter-Regular',
      fontSize: 17,
      color: colors.text,
      lineHeight: 22,
    },
    callout: {
      fontFamily: 'Inter-Regular',
      fontSize: 16,
      color: colors.textSecondary,
    },
    subheadline: {
      fontFamily: 'Inter-Regular',
      fontSize: 15,
      color: colors.textSecondary,
    },
    footnote: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: colors.textTertiary,
    },
    caption: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: colors.textTertiary,
    },
    label: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 13,
      color: colors.textTertiary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
  };
}

function buildShadows(mode: ThemeMode, colors: ThemeColors) {
  // Dark surfaces need much softer/less-opaque shadows (black shadow on black
  // is invisible) — lean on a faint glow instead of a drop shadow.
  const opacityScale = mode === 'dark' ? 0.5 : 1;
  return {
    xs: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04 * opacityScale,
      shadowRadius: 4,
      elevation: 1,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06 * opacityScale,
      shadowRadius: 12,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08 * opacityScale,
      shadowRadius: 20,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1 * opacityScale,
      shadowRadius: 28,
      elevation: 8,
    },
    fab: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: mode === 'dark' ? 0.55 : 0.35,
      shadowRadius: 16,
      elevation: 10,
    },
    nav: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12 * opacityScale,
      shadowRadius: 24,
      elevation: 12,
    },
    colored: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: mode === 'dark' ? 0.45 : 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
  };
}

export function buildTheme(mode: ThemeMode) {
  const colors = mode === 'dark' ? darkColors : lightColors;
  return {
    mode,
    colors,
    spacing,
    borderRadius,
    typography: buildTypography(colors),
    shadows: buildShadows(mode, colors),
    gradients: {
      primary: [colors.gradientStart, colors.gradientEnd] as [string, string],
      surface: mode === 'dark'
        ? ([colors.background, colors.surfaceSecondary] as [string, string])
        : ([colors.background, colors.primarySurface] as [string, string]),
    },
  };
}

export type AppTheme = ReturnType<typeof buildTheme>;

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

// Static default kept for any file not yet migrated to useAppTheme().
export const theme = lightTheme;

export function createGlobalStyles(t: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.colors.background,
    },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: t.borderRadius.xl,
      padding: t.spacing.lg,
      marginBottom: t.spacing.md,
      ...t.shadows.sm,
    },
    listSection: {
      backgroundColor: t.colors.surface,
      borderRadius: t.borderRadius.xl,
      overflow: 'hidden',
      marginBottom: t.spacing.md,
      ...t.shadows.sm,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.borderLight,
      marginLeft: 56,
    },
  });
}

// Backward-compatible static export (light mode only — not dark-mode aware).
export const globalStyles = createGlobalStyles(lightTheme);
