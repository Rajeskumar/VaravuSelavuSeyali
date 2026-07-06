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

  // Kept for back-compat with every existing `LinearGradient colors={[gradientStart, gradientEnd]}`
  // call site (~10 screens) — see TS-DES-101. Reconcile has no gradient, so both stops resolve to
  // the same flat jade and those call sites render as a flat fill with zero edits.
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

  overlay: string;

  /** Ceremony-only accent (Design Spec §2) — reconcile tick / settle-up "all squared up" moment. Never a fill. */
  gold: string;
}

// "Reconcile" (docs/design/TrackSpense_UX_Design_Spec.md §9): one flat signature color (jade) on
// a quiet ink/paper neutral system. No gradients. Money is `text` (ink) by default; jade/ember/gold
// carry meaning (positive / negative / ceremony) — see `directionalColor()` below.
const lightColors: ThemeColors = {
  primary: '#0FA37F',        // jade
  primaryLight: '#3DBE9E',
  primaryDark: '#0B8A6B',    // jadeText — accessible small-text variant
  primarySurface: '#E3F5EF',
  secondary: '#191A1E',      // ink — neutral secondary action, not a second brand hue
  secondarySurface: '#ECECE7',

  gradientStart: '#0FA37F',
  gradientEnd: '#0FA37F',

  background: '#F7F7F4',     // paper
  surface: '#FFFFFF',
  surfaceSecondary: '#EFEFEA',
  surfaceElevated: '#FFFFFF',

  text: '#191A1E',           // ink
  textSecondary: '#6B6D74',  // ink-muted
  textTertiary: '#8E8E93',
  textQuaternary: '#C7C7CC',
  textInverse: '#FFFFFF',

  success: '#0B8A6B',        // jadeText (positive semantic doubles with brand, per §2)
  successSurface: '#E3F5EF',
  error: '#DE5B4B',          // ember
  errorSurface: '#FBEAE7',
  warning: '#B78A2E',        // caution — deliberately distinct from `gold`'s ceremony-only role
  warningSurface: '#F5EEDD',

  border: '#D2D2D7',
  borderLight: '#E4E4DF',    // hairline

  overlay: 'rgba(25,26,30,0.4)',

  gold: '#C9973F',
};

const darkColors: ThemeColors = {
  primary: '#1CBE94',        // jade, ~8% luminance lift for dark-mode contrast (§2)
  primaryLight: '#3DBE9E',
  primaryDark: '#17A17E',
  primarySurface: '#0F2A22',
  secondary: '#F7F7F4',      // paper — inverted neutral secondary action on dark backgrounds
  secondarySurface: '#2A2B31',

  gradientStart: '#1CBE94',
  gradientEnd: '#1CBE94',

  background: '#191A1E',     // ink — Reconcile's dark-mode background (§2)
  surface: '#202127',
  surfaceSecondary: '#28292F',
  surfaceElevated: '#202127',

  text: '#F5F5F2',
  textSecondary: '#9A9CA3',
  textTertiary: '#8E8E93',
  textQuaternary: '#48484A',
  textInverse: '#191A1E',

  success: '#1CBE94',
  successSurface: '#0F2A22',
  error: '#E8705F',          // ember, ~8% luminance lift for dark-mode contrast (§2)
  errorSurface: '#3A211C',
  warning: '#C99A42',
  warningSurface: '#332B18',

  border: '#38383A',
  borderLight: '#33343B',    // hairline (dark)

  overlay: 'rgba(0,0,0,0.6)',

  gold: '#D9A752',
};

/** Spring/timing presets for react-native-reanimated — reused for the hero-count / settle-up count-to-zero moments (§5). */
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

// Reconcile radius scale (Design Spec §9): 10px surfaces / 8px controls / pill for lens+chips.
// `full` stays a distinct, large numeric value reserved for pill-shaped CTA/lens/chip components
// (e.g. CustomButton, matching the reference prototypes' full-width rounded-full primary actions)
// rather than the general card/surface default.
export const borderRadius = {
  xs: 8,   // control
  sm: 8,   // control
  md: 10,  // surface
  lg: 10,  // surface
  xl: 10,  // surface
  xxl: 12, // large surface (sheets) — one step up from the flat 10px card radius
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
      display: 'SpaceGrotesk-SemiBold', // Reconcile display face — hero numbers/section moments only
    },
    // True Total / big balance — Design Spec §3 `display-hero` (44–56px).
    displayHero: {
      fontFamily: 'SpaceGrotesk-SemiBold',
      fontSize: 48,
      color: colors.text,
      fontVariant: ['tabular-nums'] as const,
    },
    // Screen balances, big stats — §3 `display` (32px).
    display: {
      fontFamily: 'SpaceGrotesk-SemiBold',
      fontSize: 32,
      color: colors.text,
      fontVariant: ['tabular-nums'] as const,
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
    // Every list/row figure — §3 `amount` (16–18px, tabular-nums mandatory).
    amount: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 17,
      color: colors.text,
      fontVariant: ['tabular-nums'] as const,
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
  // Reconcile: "elevation reserved for sheets only; everything else uses hairline + tint" (§9).
  // Ordinary card/row tiers collapse to ~zero so `borderLight` (hairline) does the separation
  // work instead; only real bottom-sheet/modal-equivalent surfaces keep a visible shadow.
  const opacityScale = mode === 'dark' ? 0.5 : 1;
  return {
    xs: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    // "Sheets only" tiers below keep real elevation.
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.1 * opacityScale,
      shadowRadius: 20,
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

/**
 * Money-color policy (Design Spec §2): `text` (ink) is the default for every neutral amount.
 * `success`/`error` (jade/ember) are reserved for signed, directional amounts (owed-to-you /
 * you-owe) and must always be paired with a sign and a word — never color alone. Call this
 * instead of reaching for `colors.success`/`colors.error` ad hoc.
 */
export function directionalColor(t: AppTheme, net: number): string {
  if (net > 0) return t.colors.success;
  if (net < 0) return t.colors.error;
  return t.colors.textTertiary;
}

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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.borderLight,
      ...t.shadows.sm,
    },
    listSection: {
      backgroundColor: t.colors.surface,
      borderRadius: t.borderRadius.xl,
      overflow: 'hidden',
      marginBottom: t.spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.borderLight,
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
