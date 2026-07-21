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

  // Real 2-stop violet→cyan gradient, identical in both modes — the gradient CTA is a
  // self-contained brand chip (fixed pastel fill + ink text, see CustomButton.tsx) that reads
  // the same regardless of canvas, so it isn't duplicated per mode. Every existing
  // `LinearGradient colors={[gradientStart, gradientEnd]}` call site renders it for free.
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
  /** Text/icon color for content sitting on a *flat* `primary`/`secondary`/`error`/`warning`
   * fill (buttons, avatar circles, badges) — ink in dark mode (those fills are light pastels),
   * flips to a light color in light mode once `primary`/etc. become darker/saturated there.
   * NOT for content on the gradient CTA, which stays pastel in both modes and always wants ink
   * — components using the gradient hardcode ink directly rather than reading this token. Also
   * not for content on the fixed pastel `memberColor()`/avatar-palette fills (BalanceRow.tsx
   * etc.), which likewise stay light in both modes and hardcode ink directly. */
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

  /**
   * Ceremony accent — settle-up "all squared up" moment / reconciled tick. Resolves to the
   * brand accent, same policy as Slate. Field name kept for zero call-site changes.
   */
  gold: string;
}

/**
 * "CerebroOS" (design system pulled from the Claude Design project) — violet→cyan gradient
 * brand, light + dark modes. The source design only specified a dark canvas; the light palette
 * is this app's own extension (same approach as the web app's theme.ts — see that file's header
 * comment for the full rationale): `primary`/`secondary`/money-signal colors are darkened/
 * saturated for contrast on a white canvas, since they're used as flat text/icon colors in
 * dozens of places, not just fills. RN's color parser (`@react-native/normalize-colors`) has no
 * oklch() support, so every accent is the pre-computed sRGB hex twin of the web theme's oklch
 * value.
 */
const lightColors: ThemeColors = {
  primary: '#5E48C8',        // violet accent (light) — same computed value as web's cerebro.violetAccentHex
  primaryLight: '#8571DB',
  primaryDark: '#4A3898',
  primarySurface: '#EDE9FB',

  secondary: '#00787A',      // cyan accent (light) — matches web's cerebro.cyanAccentHex
  secondarySurface: '#DFF3F3',

  gradientStart: '#AEA5FF',  // violet — oklch(0.78 0.17 285), mode-independent
  gradientEnd: '#00E0E0',    // cyan — oklch(0.82 0.14 195), mode-independent

  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceSecondary: 'rgba(0,0,0,0.04)',
  surfaceElevated: '#FFFFFF',

  text: '#101218',
  textSecondary: '#5B6172',
  textTertiary: '#8B909E',
  textQuaternary: '#C4C8D1',
  textInverse: '#FFFFFF',

  success: '#15803D',
  successSurface: '#DCFCE7',
  error: '#B91C1C',
  errorSurface: '#FEE2E2',
  warning: '#B45309',
  warningSurface: '#FEF3C7',

  border: 'rgba(0,0,0,0.15)',
  borderLight: 'rgba(0,0,0,0.08)',

  overlay: 'rgba(0,0,0,0.4)',

  gold: '#5E48C8',
};

const darkColors: ThemeColors = {
  primary: '#9C93FF',        // violet accent (dark) — oklch(0.72 0.16 285)
  primaryLight: '#B7B0FF',
  primaryDark: '#7C72E8',
  primarySurface: '#1C1830',

  secondary: '#00D2D3',      // cyan accent (dark) — oklch(0.78 0.14 195)
  secondarySurface: '#0E2626',

  gradientStart: '#AEA5FF',  // violet — oklch(0.78 0.17 285)
  gradientEnd: '#00E0E0',    // cyan — oklch(0.82 0.14 195)

  background: '#05060A',     // ink
  surface: 'rgba(255,255,255,0.03)',
  surfaceSecondary: 'rgba(255,255,255,0.06)',
  surfaceElevated: '#0E0F16',

  text: '#F0F1F5',
  textSecondary: '#9AA0AF',
  textTertiary: '#6B7080',
  textQuaternary: '#4B4F5A',
  textInverse: '#05060A',

  success: '#4ADE80',
  successSurface: '#0F2A1A',
  error: '#F87171',
  errorSurface: '#3A1C1C',
  warning: '#FBBF24',
  warningSurface: '#332818',

  border: 'rgba(255,255,255,0.15)',
  borderLight: 'rgba(255,255,255,0.1)',

  overlay: 'rgba(0,0,0,0.65)',

  gold: '#9C93FF',           // ceremony → brand accent
};

/** Fixed ink color for text/icons on the mode-independent pastel fills: the gradient CTA
 * (`gradientStart`/`gradientEnd`) and the deterministic `memberColor()`-style avatar palettes
 * (BalanceRow.tsx etc.) — both stay light pastel in either mode, so unlike `textInverse` (which
 * flips with `primary`), content on these always wants ink. */
export const inkOnPastel = '#05060A';

/** Spring/timing presets for react-native-reanimated — reused for the hero-count / settle-up count-to-zero moments, and the Badge pulse. */
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

// CerebroOS radius scale: 12px controls, 16px surfaces, pill for lens/chips/badges.
export const borderRadius = {
  xs: 12,  // control
  sm: 12,  // control
  md: 16,  // surface
  lg: 16,  // surface
  xl: 16,  // surface
  xxl: 20, // large surface (sheets) — one step up from the 16px card radius
  full: 9999,
};

function buildTypography(colors: ThemeColors) {
  return {
    fontFamily: {
      regular: 'InstrumentSans-Regular',
      medium: 'InstrumentSans-Medium',
      semiBold: 'InstrumentSans-SemiBold',
      bold: 'InstrumentSans-Bold',
      // Instrument Sans tops out at 700/Bold (no 900/Black cut) — reuse Bold for the one role
      // (h1) that previously wanted an extra-heavy weight.
      black: 'InstrumentSans-Bold',
      display: 'BricolageGrotesque-SemiBold', // Display face — hero numbers/section moments only
      mono: 'IBMPlexMono-Medium', // Eyebrow labels, status badges
      monoRegular: 'IBMPlexMono-Regular',
    },
    // True Total / big balance — display-hero (44–56px).
    displayHero: {
      fontFamily: 'BricolageGrotesque-SemiBold',
      fontSize: 48,
      color: colors.text,
      fontVariant: ['tabular-nums'] as const,
    },
    // Screen balances, big stats — display (32px).
    display: {
      fontFamily: 'BricolageGrotesque-SemiBold',
      fontSize: 32,
      color: colors.text,
      fontVariant: ['tabular-nums'] as const,
    },
    h1: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 34,
      color: colors.text,
      letterSpacing: -0.5,
    },
    h2: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 28,
      color: colors.text,
      letterSpacing: -0.3,
    },
    h3: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 22,
      color: colors.text,
      letterSpacing: -0.2,
    },
    body: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 17,
      color: colors.text,
    },
    bodyRegular: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 17,
      color: colors.text,
      lineHeight: 22,
    },
    // Every list/row figure — `amount` (16–18px, tabular-nums mandatory).
    amount: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 17,
      color: colors.text,
      fontVariant: ['tabular-nums'] as const,
    },
    callout: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 16,
      color: colors.textSecondary,
    },
    subheadline: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 15,
      color: colors.textSecondary,
    },
    footnote: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 13,
      color: colors.textTertiary,
    },
    caption: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 12,
      color: colors.textTertiary,
    },
    label: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 13,
      color: colors.textTertiary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    // Net-new for CerebroOS: mono uppercase section-label/status-badge role ("01 / FEATURES",
    // "LIVE"). 0.14em of a 12px face ≈ 1.7pt letter-spacing.
    eyebrow: {
      fontFamily: 'IBMPlexMono-Medium',
      fontSize: 12,
      color: colors.primary,
      textTransform: 'uppercase' as const,
      letterSpacing: 1.7,
    },
  };
}

function buildShadows(mode: ThemeMode, colors: ThemeColors) {
  // Elevation policy: reserved for sheets only; everything else uses hairline + tint. Ordinary
  // card/row tiers collapse to ~zero so `borderLight` (hairline) does the separation work
  // instead; only real bottom-sheet/modal-equivalent surfaces and the primary-CTA glow keep a
  // visible shadow.
  const opacityScale = mode === 'dark' ? 1 : 0.6;
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
      shadowOpacity: 0.5 * opacityScale,
      shadowRadius: 20,
      elevation: 8,
    },
    // Primary-CTA glow — CerebroOS's `0 0 40px oklch(0.65 0.2 285 / 0.45)`. RN shadows have no
    // spread and Android's `elevation` ignores shadowColor entirely, so this reads correctly on
    // iOS but will look flatter on Android — flagged as a known platform gap, not fixed here.
    // Glow color is mode-independent (matches the gradient) — it's still visible, just softer,
    // against a light canvas.
    fab: {
      shadowColor: '#8776FF', // glow — oklch(0.65 0.2 285)
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.55 * opacityScale,
      shadowRadius: 20,
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
      shadowOpacity: 0.45 * opacityScale,
      shadowRadius: 16,
      elevation: 8,
    },
  };
}

export function buildTheme(mode: ThemeMode = 'dark') {
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
      // Subtle canvas-depth gradient for the screen base (ScreenWrapper.tsx) — the violet/cyan
      // "orbs" pop is layered on top via AmbientBackground.tsx, not baked into this base fill.
      surface: mode === 'dark'
        ? ([colors.background, colors.surfaceElevated] as [string, string])
        : ([colors.background, '#F1F1F5'] as [string, string]),
    },
  };
}

export type AppTheme = ReturnType<typeof buildTheme>;

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

// Static default kept for any file not yet migrated to useAppTheme().
export const theme = darkTheme;

/**
 * Money-color policy: `text` (ink) is the default for every neutral amount. `success`/`error`
 * are reserved for signed, directional amounts (owed-to-you / you-owe) and must always be paired
 * with a sign and a word — never color alone. Call this instead of reaching for
 * `colors.success`/`colors.error` ad hoc.
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

// Backward-compatible static export.
export const globalStyles = createGlobalStyles(darkTheme);
