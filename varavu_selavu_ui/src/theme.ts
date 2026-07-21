import { createTheme, PaletteMode, Theme } from '@mui/material/styles';

/**
 * "CerebroOS" design language — violet→cyan gradient brand, light + dark modes. The source
 * Claude Design project only specified a dark canvas (ink bg, pastel violet/cyan accents); the
 * light palette below is this app's own extension, built to the same brand hues but re-tuned for
 * contrast on a white canvas (accents darkened via oklch lightness reduction, money-signal colors
 * reused from the pre-CerebroOS "Slate" light values which were already contrast-checked against
 * white). Follows the original Slate naming convention: bare key = light (default), `*Dark` = dark.
 * Gradient/glow tokens are mode-independent — the gradient CTA is a self-contained brand chip
 * (fixed violet→cyan fill + ink text) that reads the same regardless of page canvas, so it's not
 * duplicated per mode. Gradient/box-shadow strings are kept as real CSS `oklch()` (native browser
 * support); MUI's color manipulator and this file's `withAlpha()` only understand hex/rgb, so
 * anywhere a token feeds palette.primary.main, a Chip tint, etc., use the `*Hex` variant.
 */
export const cerebro = {
  // Light mode
  ink: '#FAFAFA',
  textPrimary: '#101218',
  textSecondary: '#5B6172',
  textMuted: '#8B909E',
  surfaceBg: '#FFFFFF',
  surfaceBorder: 'rgba(0,0,0,0.08)',
  surfaceBorderStrong: 'rgba(0,0,0,0.15)',
  violetAccentHex: '#5E48C8',
  cyanAccentHex: '#00787A',
  positive: '#15803D',
  negative: '#B91C1C',
  caution: '#B45309',

  // Dark mode
  inkDark: '#05060a',
  textPrimaryDark: '#f0f1f5',
  textSecondaryDark: '#9aa0af',
  textMutedDark: '#6b7080',
  surfaceBgDark: 'rgba(255,255,255,0.03)',
  surfaceBorderDark: 'rgba(255,255,255,0.1)',
  surfaceBorderStrongDark: 'rgba(255,255,255,0.15)',
  violetAccentHexDark: '#9C93FF',
  cyanAccentHexDark: '#00D2D3',
  positiveDark: '#4ADE80',
  negativeDark: '#F87171',
  cautionDark: '#FBBF24',

  // Mode-independent — brand gradient stops, glow, radii
  violet: 'oklch(0.78 0.17 285)',
  violetHex: '#AEA5FF',
  violetAccent: 'oklch(0.72 0.16 285)',
  cyan: 'oklch(0.82 0.14 195)',
  cyanHex: '#00E0E0',
  cyanAccent: 'oklch(0.78 0.14 195)',
  glowShadow: '0 0 40px oklch(0.65 0.2 285 / 0.45)',
  glowHex: '#8776FF',
  surfaceTinted: 'linear-gradient(160deg, oklch(0.3 0.1 285 / 0.5), rgba(10,11,16,0.7))',
  radius: { surface: 16, control: 12, pill: 999 },
} as const;

/** Resolves a mode-suffixed token pair — `cerebroTokens('dark').textPrimary` etc. — for call
 * sites that need the flat hex/rgb value directly rather than going through MUI's `Theme`
 * object (charts, inline SVG, non-MUI components). */
export function cerebroTokens(mode: PaletteMode) {
  const isDark = mode === 'dark';
  return {
    ink: isDark ? cerebro.inkDark : cerebro.ink,
    textPrimary: isDark ? cerebro.textPrimaryDark : cerebro.textPrimary,
    textSecondary: isDark ? cerebro.textSecondaryDark : cerebro.textSecondary,
    textMuted: isDark ? cerebro.textMutedDark : cerebro.textMuted,
    surfaceBg: isDark ? cerebro.surfaceBgDark : cerebro.surfaceBg,
    surfaceBorder: isDark ? cerebro.surfaceBorderDark : cerebro.surfaceBorder,
    surfaceBorderStrong: isDark ? cerebro.surfaceBorderStrongDark : cerebro.surfaceBorderStrong,
    violetAccentHex: isDark ? cerebro.violetAccentHexDark : cerebro.violetAccentHex,
    cyanAccentHex: isDark ? cerebro.cyanAccentHexDark : cerebro.cyanAccentHex,
    positive: isDark ? cerebro.positiveDark : cerebro.positive,
    negative: isDark ? cerebro.negativeDark : cerebro.negative,
    caution: isDark ? cerebro.cautionDark : cerebro.caution,
  };
}

/** Primary CTA: violet→cyan gradient fill + glow shadow. Ink text (not white) per the source design system's "Primary · gradient" spec — mode-independent, see file header. */
export const gradientCta = {
  backgroundImage: `linear-gradient(120deg, ${cerebro.violet}, ${cerebro.cyan})`,
  color: cerebro.inkDark,
  boxShadow: cerebro.glowShadow,
} as const;

/**
 * "Primary · light" button treatment — the design system's second filled button, meant to
 * contrast against the gradient CTA. On the dark canvas that's a near-white fill (`#f0f1f5` bg +
 * ink text, the source spec's literal values); a near-white fill on a white/light canvas would
 * have no contrast, so light mode flips it to a near-ink fill + white text instead — same "the
 * other solid button" role, adapted per canvas. Mode-aware function (not a static export) since
 * the fill flips by mode.
 */
export function primaryLightSx(mode: PaletteMode) {
  const isDark = mode === 'dark';
  const bg = isDark ? cerebro.textPrimaryDark : cerebro.textPrimary;
  const fg = isDark ? cerebro.inkDark : cerebro.ink;
  return {
    color: fg,
    backgroundColor: bg,
    backgroundImage: 'none',
    boxShadow: 'none',
    '&:hover': { backgroundColor: bg, filter: isDark ? 'brightness(0.94)' : 'brightness(1.15)' },
  } as const;
}

/** Restrained motion cadence: 150ms fades/slides, no bounce. Scroll-reveal (see ScrollReveal.tsx) uses its own slower 0.8s/stagger cadence per the CerebroOS motion spec. */
export const motion = {
  easing: [0.16, 1, 0.3, 1] as const,
  easingCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
  fast: 0.15,
  base: 0.3,
  slow: 0.45,
};

export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Money-color policy: `text.primary` is the default for every neutral amount. `positive`/
 * `negative` are reserved for signed, directional amounts (owed-to-you / you-owe, over/under
 * budget) and must always be paired with a sign and a word — never color alone (a11y floor).
 * CerebroOS's source design system doesn't define directional colors (it's a marketing
 * template) — dark values reuse Slate's dark-mode values verbatim (already contrast-checked
 * against a near-black canvas), light values reuse Slate's light-mode values likewise.
 */
export function directionalColor(theme: Theme, net: number): string {
  const t = cerebroTokens(theme.palette.mode);
  if (net > 0) return t.positive;
  if (net < 0) return t.negative;
  return t.textSecondary;
}

const displayFontFamily = "'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, sans-serif";
const bodyFontFamily = "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const monoFontFamily = "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

/** Apply to any element rendering a money figure — enforces Design Spec §3's tabular-numeral rule. */
export const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const;

/**
 * Numeral-first type roles, exported as reusable `sx` fragments rather than MUI typography
 * variants — components opt in explicitly (`sx={typeScale.amount}`) instead of every
 * `variant="h1"` silently picking up the display face. `eyebrow` is net-new for CerebroOS:
 * the mono uppercase section-label role used throughout the source design system
 * ("01 / FEATURES", status badges).
 */
export const typeScale = {
  displayHero: {
    fontFamily: displayFontFamily,
    fontWeight: 700,
    fontSize: '3rem', // 48px, within the spec's 44–56px hero range
    lineHeight: 1.2,
    letterSpacing: '-0.03em',
    ...tabularNums,
  },
  display: {
    fontFamily: displayFontFamily,
    fontWeight: 600,
    fontSize: '2rem', // 32px
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    ...tabularNums,
  },
  amount: {
    fontFamily: bodyFontFamily,
    fontWeight: 600,
    fontSize: '1rem', // 16–18px range
    ...tabularNums,
  },
  label: {
    fontFamily: bodyFontFamily,
    fontWeight: 600,
    fontSize: '0.6875rem', // 11px
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  eyebrow: {
    fontFamily: monoFontFamily,
    fontWeight: 500,
    fontSize: '0.75rem', // 12px
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
} as const;

export function getTheme(mode: PaletteMode = 'dark'): Theme {
  const isDark = mode === 'dark';
  const t = cerebroTokens(mode);
  const primaryMain = t.violetAccentHex;

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: t.cyanAccentHex },
      background: { default: t.ink, paper: t.surfaceBg },
      success: { main: t.positive },
      error: { main: t.negative },
      warning: { main: t.caution },
      text: { primary: t.textPrimary, secondary: t.textSecondary },
      divider: t.surfaceBorder,
    },
    shape: { borderRadius: cerebro.radius.surface },
    typography: {
      fontFamily: bodyFontFamily,
      fontSize: 15,
      h1: { fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 },
      h2: { fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1 },
      h3: { fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 },
      h4: { fontWeight: 700, letterSpacing: '-0.015em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      body1: { lineHeight: 1.6 },
      button: { fontWeight: 600, letterSpacing: '-0.005em' },
    },
    transitions: {
      easing: {
        easeInOut: motion.easingCss,
        easeOut: motion.easingCss,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: t.ink,
          },
          '*:focus-visible': {
            outline: `2px solid ${primaryMain} !important`,
            outlineOffset: '2px !important',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: t.surfaceBg,
            backgroundImage: 'none',
            border: `1px solid ${t.surfaceBorder}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: cerebro.radius.surface,
            border: `1px solid ${t.surfaceBorder}`,
            boxShadow: 'none',
            transition: `border-color ${motion.fast}s ${motion.easingCss}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: cerebro.radius.control,
            paddingLeft: 14,
            paddingRight: 14,
            paddingTop: 6,
            paddingBottom: 6,
            fontSize: '0.8125rem',
            fontWeight: 600,
            minHeight: 34,
            boxShadow: 'none',
            transition: `all ${motion.fast}s ${motion.easingCss}`,
            '&:hover': { boxShadow: 'none' },
            '&:active': { transform: 'scale(0.98)' },
          },
          containedPrimary: {
            ...gradientCta,
            backgroundColor: 'transparent',
            '&:hover': { ...gradientCta, filter: 'brightness(1.08)' },
            // Primary CTAs (Add Expense, Create Group, Settle Up, …) are the controls tapped most
            // often — the default 34px root height fell short of the 44×44 touch-target minimum.
            minHeight: 44,
          },
          outlined: {
            borderColor: t.surfaceBorderStrong,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
            color: t.textPrimary,
            '&:hover': {
              borderColor: t.surfaceBorderStrong,
              backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
            },
          },
          text: {
            color: t.textSecondary,
            '&:hover': { color: t.textPrimary, backgroundColor: 'transparent' },
          },
          sizeSmall: {
            minHeight: 28,
            paddingLeft: 10,
            paddingRight: 10,
            fontSize: '0.75rem',
          },
          sizeLarge: {
            minHeight: 40,
            paddingLeft: 20,
            paddingRight: 20,
            fontSize: '0.875rem',
            // Large/CTA buttons read as pill, matching the reference prototypes; ordinary
            // default-size buttons stay at the control radius.
            borderRadius: cerebro.radius.pill,
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          primary: {
            ...gradientCta,
            backgroundColor: 'transparent',
            '&:hover': { ...gradientCta, filter: 'brightness(1.08)' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: cerebro.radius.control },
        },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: { borderRadius: cerebro.radius.control },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: t.surfaceBg,
            backgroundImage: 'none',
            color: t.textPrimary,
            boxShadow: 'none',
            borderBottom: `1px solid ${t.surfaceBorder}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: t.ink,
            backgroundImage: 'none',
            color: t.textPrimary,
            borderRight: `1px solid ${t.surfaceBorder}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: cerebro.radius.pill,
            '&.MuiChip-filledPrimary': {
              backgroundColor: withAlpha(primaryMain, isDark ? 0.2 : 0.12),
              color: primaryMain,
            },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: cerebro.radius.pill,
            backgroundColor: withAlpha(primaryMain, isDark ? 0.2 : 0.12),
          },
          bar: {
            borderRadius: cerebro.radius.pill,
            backgroundColor: primaryMain,
            backgroundImage: 'none',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: cerebro.radius.control,
            transition: `background-color ${motion.fast}s ${motion.easingCss}`,
            '&.Mui-selected': {
              backgroundColor: withAlpha(primaryMain, isDark ? 0.18 : 0.1),
              '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                color: primaryMain,
              },
              '&:hover': {
                backgroundColor: withAlpha(primaryMain, isDark ? 0.26 : 0.16),
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Flat "hairline card" treatment — surface background + 1px hairline border, no blur/gradient/
 * tint, no shadow. Elevation is reserved for real sheets/dialogs (which keep MUI's default
 * elevation shadow scale, untouched above); ordinary cards use hairline + flat surface instead.
 * Function name kept from the pre-CerebroOS "glass card" treatment so existing call sites don't
 * need edits.
 */
export function glassCardSx(theme: Theme) {
  const t = cerebroTokens(theme.palette.mode);
  return {
    backgroundColor: t.surfaceBg,
    backgroundImage: 'none',
    border: `1px solid ${t.surfaceBorder}`,
    boxShadow: 'none',
    borderRadius: cerebro.radius.surface / 8, // sx shorthand: theme.spacing(1) = 8px by default
  } as const;
}

/** Convenience flat-token export for non-MUI-Theme consumers (chart restyling — chartTheme.ts). */
export function gradientTokens(mode: PaletteMode = 'dark') {
  const t = cerebroTokens(mode);
  return {
    primary: t.violetAccentHex,
    positive: t.positive,
    negative: t.negative,
    ceremony: t.caution,
    surfaceSecondary: mode === 'dark' ? '#14151C' : '#F1F1F5',
  };
}

const theme = getTheme('dark');
export default theme;
