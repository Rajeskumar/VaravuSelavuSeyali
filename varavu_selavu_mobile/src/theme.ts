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

// "Apple structure, Revolut color": Apple's own system Blue → Purple gradient
// as the single vivid brand accent, carried on Apple's neutral gray canvas.
const lightColors: ThemeColors = {
  primary: '#007AFF',        // Apple system Blue
  primaryLight: '#409CFF',
  primaryDark: '#0051D5',
  primarySurface: '#E8F2FF',
  secondary: '#AF52DE',      // Apple system Purple
  secondarySurface: '#F5E9FC',

  gradientStart: '#007AFF',
  gradientEnd: '#AF52DE',

  background: '#F5F5F7',     // apple.com neutral gray
  surface: '#FFFFFF',
  surfaceSecondary: '#F5F5F7',
  surfaceElevated: '#FFFFFF',

  text: '#1D1D1F',
  textSecondary: '#6E6E73',
  textTertiary: '#8E8E93',
  textQuaternary: '#C7C7CC',
  textInverse: '#FFFFFF',

  success: '#34C759',
  successSurface: '#E6F9EA',
  error: '#FF3B30',
  errorSurface: '#FFEBEA',
  warning: '#FF9500',
  warningSurface: '#FFF3E0',

  border: '#D2D2D7',
  borderLight: '#E5E5EA',

  highlight: '#FF2D55',      // Apple system Pink — sparing accent
  overlay: 'rgba(0,0,0,0.4)',
};

const darkColors: ThemeColors = {
  primary: '#0A84FF',        // Apple system Blue (dark)
  primaryLight: '#409CFF',
  primaryDark: '#0040DD',
  primarySurface: '#122840',
  secondary: '#BF5AF2',      // Apple system Purple (dark)
  secondarySurface: '#2B1735',

  gradientStart: '#0A84FF',
  gradientEnd: '#BF5AF2',

  background: '#000000',
  surface: '#1C1C1E',
  surfaceSecondary: '#2C2C2E',
  surfaceElevated: '#1C1C1E',

  text: '#F5F5F7',
  textSecondary: '#98989D',
  textTertiary: '#8E8E93',
  textQuaternary: '#48484A',
  textInverse: '#1D1D1F',

  success: '#30D158',
  successSurface: '#0F2818',
  error: '#FF453A',
  errorSurface: '#3A1210',
  warning: '#FF9F0A',
  warningSurface: '#3A2708',

  border: '#38383A',
  borderLight: '#2C2C2E',

  highlight: '#FF375F',
  overlay: 'rgba(0,0,0,0.6)',
};

/** Spring/timing presets for react-native-reanimated — tuned for an Apple-like, gentle settle. */
export const motion = {
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springBouncy: { damping: 12, stiffness: 260, mass: 0.9 },
  pressScale: 0.96,
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
