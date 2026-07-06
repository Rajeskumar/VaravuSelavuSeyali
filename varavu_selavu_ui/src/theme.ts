import { createTheme, PaletteMode, Theme } from '@mui/material/styles';

/**
 * "Reconcile" — TrackSpense's design language (docs/design/TrackSpense_UX_Design_Spec.md §9).
 * One flat signature color (jade) on a quiet ink/paper neutral system. No gradients, no
 * glassmorphism, no blanket hover-lift. Money renders in `ink` by default; jade/ember/gold
 * carry meaning (positive / negative / ceremony), not decoration — see `directionalColor()`.
 */
export const reconcile = {
  ink: '#191A1E',
  inkMuted: '#6B6D74',
  paper: '#F7F7F4',
  surface: '#FFFFFF',
  surfaceDark: '#202127',
  hairline: '#E4E4DF',
  hairlineDark: '#33343B',
  jade: '#0FA37F',
  jadeText: '#0B8A6B', // accessible small-text variant on light backgrounds (§2 a11y floor)
  jadeDark: '#1CBE94', // ~8% luminance lift for dark-mode contrast (§2)
  ember: '#DE5B4B',
  emberDark: '#E8705F',
  gold: '#C9973F', // ceremony only — reconcile tick, streaks, receipt-parse success. Never a fill.
  goldDark: '#D9A752',
  // Reconcile has no dedicated "caution" token (gold is ceremony-only, not generic warning) —
  // this is a plain, deliberately unglamorous amber kept distinct from `gold` so gold's scarcity
  // (Design Spec §2: "gold appears maybe twice per session") isn't diluted by routine form/toast
  // warnings borrowing it.
  caution: '#B78A2E',
  cautionDark: '#C99A42',
  radius: { surface: 10, control: 8, pill: 999 },
} as const;

/**
 * Back-compat shim: every pre-Reconcile consumer (App.tsx, HomePage.tsx, LoginPage.tsx,
 * GroupsPage.tsx — none of them owned by this ticket) builds its own
 * `linear-gradient(135deg, brand.gradientStart, brand.gradientEnd)` / radial wash inline. Rather
 * than edit those files, both stops now resolve to the same flat jade, so every existing gradient
 * call site renders as a flat fill with zero call-site changes (TS-DES-101's own acceptance
 * criterion). `pop`/`popDark` (Apple system Pink) are dropped — nothing consumed them.
 */
export const brand = {
  gradientStart: reconcile.jade,
  gradientEnd: reconcile.jade,
  gradientStartDark: reconcile.jadeDark,
  gradientEndDark: reconcile.jadeDark,
};

/** Reconcile's restrained motion cadence (Design Spec §5): 150ms fades/slides, no bounce. */
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
 * Money-color policy (Design Spec §2): `ink` is the default for every neutral amount. jade/ember
 * are reserved for signed, directional amounts (owed-to-you / you-owe, over/under budget) and
 * must always be paired with a sign and a word — never color alone (§2 a11y floor). Components
 * rendering a directional balance should call this instead of reaching for `success`/`error`
 * ad hoc, so the "ink unless directional" rule is encoded once, not re-decided per component.
 */
export function directionalColor(theme: Theme, net: number): string {
  const isDark = theme.palette.mode === 'dark';
  if (net > 0) return isDark ? reconcile.jadeDark : reconcile.jadeText;
  if (net < 0) return isDark ? reconcile.emberDark : reconcile.ember;
  return theme.palette.text.secondary;
}

const displayFontFamily = "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif";
const bodyFontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Apply to any element rendering a money figure — enforces Design Spec §3's tabular-numeral rule. */
export const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const;

/**
 * Reconcile's numeral-first type roles (Design Spec §3), exported as reusable `sx` fragments
 * rather than MUI typography variants — components opt in explicitly (`sx={typeScale.amount}`)
 * instead of every `variant="h1"` silently picking up the display face. Display face is reserved
 * for the True Total / big balances / section moments only, per the ticket's scope.
 */
export const typeScale = {
  displayHero: {
    fontFamily: displayFontFamily,
    fontWeight: 600,
    fontSize: '3rem', // 48px, within the spec's 44–56px hero range
    lineHeight: 1.05,
    ...tabularNums,
  },
  display: {
    fontFamily: displayFontFamily,
    fontWeight: 600,
    fontSize: '2rem', // 32px
    lineHeight: 1.1,
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
} as const;

export function getTheme(mode: PaletteMode): Theme {
  const isDark = mode === 'dark';

  const primaryMain = isDark ? reconcile.jadeDark : reconcile.jade;
  const secondaryMain = isDark ? reconcile.paper : reconcile.ink;
  const hairlineColor = isDark ? reconcile.hairlineDark : reconcile.hairline;
  const surfaceColor = isDark ? reconcile.surfaceDark : reconcile.surface;

  const backgroundDefault = isDark ? reconcile.ink : reconcile.paper;
  const backgroundPaper = surfaceColor;

  const textPrimary = isDark ? '#F5F5F2' : reconcile.ink;
  const textSecondary = isDark ? '#9A9CA3' : reconcile.inkMuted;

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: secondaryMain },
      background: { default: backgroundDefault, paper: backgroundPaper },
      success: { main: isDark ? reconcile.jadeDark : reconcile.jadeText },
      error: { main: isDark ? reconcile.emberDark : reconcile.ember },
      warning: { main: isDark ? reconcile.cautionDark : reconcile.caution },
      text: { primary: textPrimary, secondary: textSecondary },
      divider: hairlineColor,
    },
    shape: { borderRadius: reconcile.radius.surface },
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
          // Flat neutral canvas — no radial/linear wash. Reconcile spends its one signature
          // color on interaction and state, not on ambient page decoration (Design Spec §1.5).
          body: {
            backgroundColor: backgroundDefault,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: surfaceColor,
            backgroundImage: 'none',
            border: `1px solid ${hairlineColor}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: reconcile.radius.surface,
            border: `1px solid ${hairlineColor}`,
            boxShadow: 'none',
            transition: `border-color ${motion.fast}s ${motion.easingCss}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: reconcile.radius.control,
            paddingLeft: 22,
            paddingRight: 22,
            boxShadow: 'none',
            transition: `all ${motion.fast}s ${motion.easingCss}`,
            '&:hover': { boxShadow: 'none' },
            '&:active': { transform: 'scale(0.98)' },
          },
          containedPrimary: {
            backgroundColor: primaryMain,
            backgroundImage: 'none',
            '&:hover': { backgroundColor: primaryMain, filter: 'brightness(1.08)' },
          },
          sizeLarge: {
            paddingTop: 12,
            paddingBottom: 12,
            fontSize: '1.05rem',
            // Large/CTA buttons read as pill, matching the reference prototypes
            // (ExpenseFeed.jsx / SettleUp.jsx / Dashboard.jsx render every full-width primary
            // action as rounded-full); ordinary default-size buttons stay at the control radius.
            borderRadius: reconcile.radius.pill,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: reconcile.radius.control },
        },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: { borderRadius: reconcile.radius.control },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: surfaceColor,
            color: textPrimary,
            boxShadow: 'none',
            borderBottom: `1px solid ${hairlineColor}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: surfaceColor,
            color: textPrimary,
            borderRight: `1px solid ${hairlineColor}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: reconcile.radius.pill,
            '&.MuiChip-filledPrimary': {
              backgroundColor: isDark ? withAlpha(primaryMain, 0.2) : withAlpha(primaryMain, 0.1),
              color: primaryMain,
            },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: reconcile.radius.pill,
            backgroundColor: isDark ? withAlpha(primaryMain, 0.2) : withAlpha(primaryMain, 0.1),
          },
          bar: {
            borderRadius: reconcile.radius.pill,
            backgroundColor: primaryMain,
            backgroundImage: 'none',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: reconcile.radius.control,
            transition: `background-color ${motion.fast}s ${motion.easingCss}`,
            '&.Mui-selected': {
              backgroundColor: isDark ? withAlpha(primaryMain, 0.18) : withAlpha(primaryMain, 0.08),
              '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                color: primaryMain,
              },
              '&:hover': {
                backgroundColor: isDark ? withAlpha(primaryMain, 0.26) : withAlpha(primaryMain, 0.12),
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Reconcile's flat "hairline card" treatment — surface background + 1px hairline border, no
 * blur/gradient/tint, no shadow. Elevation is reserved for real sheets/dialogs (which keep MUI's
 * default elevation shadow scale, untouched above); ordinary cards use hairline + flat surface
 * instead (Design Spec §9). Function name kept from the pre-Reconcile "glass card" treatment so
 * the ~17 existing call sites (Dashboard/Analysis/AI-Analyst/Groups/Login/Home cards) don't need
 * edits — restyling what each of those screens does with it is follow-on work (TS-DES-102/103/104).
 */
export function glassCardSx(theme: Theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    backgroundColor: isDark ? reconcile.surfaceDark : reconcile.surface,
    backgroundImage: 'none',
    border: `1px solid ${isDark ? reconcile.hairlineDark : reconcile.hairline}`,
    boxShadow: 'none',
    borderRadius: reconcile.radius.surface / 8, // sx shorthand: theme.spacing(1) = 8px by default
  } as const;
}

/** Convenience flat-token export for non-MUI-Theme consumers (inline SVG, chart restyling — TS-DES-105). */
export function gradientTokens(mode: PaletteMode) {
  return mode === 'dark'
    ? {
        primary: reconcile.jadeDark,
        positive: reconcile.jadeDark,
        negative: reconcile.emberDark,
        ceremony: reconcile.goldDark,
        surfaceSecondary: '#2C2C2E',
      }
    : {
        primary: reconcile.jade,
        positive: reconcile.jadeText,
        negative: reconcile.ember,
        ceremony: reconcile.gold,
        surfaceSecondary: '#F5F5F7',
      };
}

const theme = getTheme('light');
export default theme;
