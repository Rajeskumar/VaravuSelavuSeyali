import { createTheme, PaletteMode, Theme } from '@mui/material/styles';

/**
 * "Slate" — TrackSpense's Redesign v2 design language (docs/design/Redesign_Proposal_v2.md §1,
 * TS-DES-201). A neutral canvas/surface/border system with one indigo-slate brand accent and
 * dedicated, distinct semantic colors for positive/negative/caution. Unlike the prior "Reconcile"
 * palette (TS-DES-101), brand and semantic-positive are deliberately NOT the same hue here — a
 * user who can't distinguish hue (colorblind) could previously not tell "this is a branded
 * control" from "this number is good news" apart; `accent` and `positive` now carry those two
 * meanings separately. Hex values confirmed identical across every `docs/design/prototypes/v2/**`
 * reference file's own `colors`/`LIGHT`/`DARK` constant.
 */
export const slate = {
  ink: '#18181B',
  inkDark: '#FAFAFA', // dark-mode "ink" (primary text-on-dark) — matches prototypes' DARK.ink exactly
  // Darkened one notch from the prototypes' literal #71717A (zinc-500): that value fails WCAG AA
  // (4.19:1) against the Expenses sticky-header tint (#EFEFEA) and the segmented-tab pill
  // background, both of which sit atop the canvas rather than pure white. #686870 clears 4.5:1
  // against every secondary-text background in the app (4.79:1 on #EFEFEA, 5.52:1 on white) while
  // reading as the same "muted gray" — dark mode's inkMutedDark was already comfortably passing
  // (6.9–7.8:1) and is unchanged.
  inkMuted: '#686870',
  inkMutedDark: '#A1A1AA',
  canvas: '#FAFAFA',
  canvasDark: '#09090B',
  surface: '#FFFFFF',
  surfaceDark: '#18181B',
  border: '#E4E4E7',
  borderDark: '#27272A',
  accent: '#3F3F9E',
  accentDark: '#6D6DC7',
  positive: '#15803D',
  positiveDark: '#4ADE80',
  negative: '#B91C1C',
  negativeDark: '#F87171',
  caution: '#B45309',
  cautionDark: '#FBBF24',
  radius: { surface: 10, control: 8, pill: 999 },
} as const;

/**
 * Back-compat shim: every pre-existing gradient consumer (App.tsx, HomePage.tsx, LoginPage.tsx,
 * GroupsPage.tsx) builds its own `linear-gradient(135deg, brand.gradientStart, brand.gradientEnd)`
 * inline. Both stops resolve to the same flat `accent` (brand's dedicated hue under Slate), so
 * every existing gradient call site renders as a flat brand-colored fill with zero call-site
 * changes — same shim strategy TS-DES-101 established, just repointed at the new brand hue.
 */
export const brand = {
  gradientStart: slate.accent,
  gradientEnd: slate.accent,
  gradientStartDark: slate.accentDark,
  gradientEndDark: slate.accentDark,
};

/** Restrained motion cadence (Design Spec §5, unchanged by the Slate pivot): 150ms fades/slides, no bounce. */
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
 * Money-color policy (carried from Design Spec §2, values repointed to Slate): `ink` is the
 * default for every neutral amount. `positive`/`negative` are reserved for signed, directional
 * amounts (owed-to-you / you-owe, over/under budget) and must always be paired with a sign and a
 * word — never color alone (a11y floor). Components rendering a directional balance should call
 * this instead of reaching for `success`/`error` ad hoc, so the "ink unless directional" rule is
 * encoded once, not re-decided per component.
 */
export function directionalColor(theme: Theme, net: number): string {
  const isDark = theme.palette.mode === 'dark';
  if (net > 0) return isDark ? slate.positiveDark : slate.positive;
  if (net < 0) return isDark ? slate.negativeDark : slate.negative;
  return theme.palette.text.secondary;
}

const displayFontFamily = "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif";
const bodyFontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Apply to any element rendering a money figure — enforces Design Spec §3's tabular-numeral rule. */
export const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const;

/**
 * Numeral-first type roles (Design Spec §3), exported as reusable `sx` fragments rather than MUI
 * typography variants — components opt in explicitly (`sx={typeScale.amount}`) instead of every
 * `variant="h1"` silently picking up the display face. Unaffected by the Slate token swap — this
 * is layout/type policy, not color.
 */
export const typeScale = {
  displayHero: {
    fontFamily: displayFontFamily,
    fontWeight: 600,
    fontSize: '3rem', // 48px, within the spec's 44–56px hero range
    // 1.05 was tight enough that Space Grotesk's cap-height clipped at the top edge
    // of its own line box in some renders (reported as "the total amount is cut off
    // at the top"); 1.2 gives the glyph room without meaningfully loosening the look.
    lineHeight: 1.2,
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

  const primaryMain = isDark ? slate.accentDark : slate.accent;
  const secondaryMain = isDark ? slate.canvas : slate.ink;
  const hairlineColor = isDark ? slate.borderDark : slate.border;
  const surfaceColor = isDark ? slate.surfaceDark : slate.surface;

  const backgroundDefault = isDark ? slate.canvasDark : slate.canvas;
  const backgroundPaper = surfaceColor;

  const textPrimary = isDark ? slate.inkDark : slate.ink;
  const textSecondary = isDark ? slate.inkMutedDark : slate.inkMuted;

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: secondaryMain },
      background: { default: backgroundDefault, paper: backgroundPaper },
      success: { main: isDark ? slate.positiveDark : slate.positive },
      error: { main: isDark ? slate.negativeDark : slate.negative },
      warning: { main: isDark ? slate.cautionDark : slate.caution },
      text: { primary: textPrimary, secondary: textSecondary },
      divider: hairlineColor,
    },
    shape: { borderRadius: slate.radius.surface },
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
          // Flat neutral canvas — no radial/linear wash. Slate spends its one signature
          // color (accent) on interaction and state, not on ambient page decoration.
          body: {
            backgroundColor: backgroundDefault,
          },
          // App-wide keyboard focus ring. Previously there was exactly one `:focus-visible` rule
          // in the whole app (a single component class) and every MuiButton computed
          // `outline: none` with no replacement ring, so keyboard users had no visible focus
          // indicator on nav items, buttons, list rows, or tabs. One token-based rule here covers
          // every interactive element instead of each component defining its own. `:focus-visible`
          // (not `:focus`) so mouse/touch clicks don't show a ring, only keyboard/AT navigation.
          // `!important` is required: MUI's own `.MuiButtonBase-root` base style sets
          // `outline: 0` at the same specificity tier (one class vs. one pseudo-class) — without
          // `!important`, whichever rule's <style> tag happens to be injected later wins the
          // cascade, which verified to be MUI's own reset on ButtonBase-derived components
          // (nav items, IconButtons, ToggleButtons), silently swallowing the ring on exactly the
          // controls this fix exists for.
          '*:focus-visible': {
            outline: `2px solid ${primaryMain} !important`,
            outlineOffset: '2px !important',
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
            borderRadius: slate.radius.surface,
            border: `1px solid ${hairlineColor}`,
            boxShadow: 'none',
            transition: `border-color ${motion.fast}s ${motion.easingCss}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          // Sleek/compact pass: MUI's own default sizing (large horizontal padding, a
          // ~52px sizeLarge height) read as oversized against the rest of the Slate
          // system's small type scale — buttons are now sized closer to the reference
          // prototypes' ~34-40px controls at every size, not just the lens/chip controls.
          root: {
            textTransform: 'none',
            borderRadius: slate.radius.control,
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
            backgroundColor: primaryMain,
            backgroundImage: 'none',
            '&:hover': { backgroundColor: primaryMain, filter: 'brightness(1.08)' },
            // Primary CTAs (Add Expense, Create Group, Settle Up, …) are the controls tapped most
            // often — the default 34px root height fell short of the 44×44 touch-target minimum.
            // Scoped to containedPrimary (not the base `root`) so secondary/tertiary buttons and
            // explicit `size="small"` primary buttons keep the compact sizing the rest of the
            // "sleek/compact pass" intentionally uses.
            minHeight: 44,
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
            borderRadius: slate.radius.pill,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: slate.radius.control },
        },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: { borderRadius: slate.radius.control },
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
            borderRadius: slate.radius.pill,
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
            borderRadius: slate.radius.pill,
            backgroundColor: isDark ? withAlpha(primaryMain, 0.2) : withAlpha(primaryMain, 0.1),
          },
          bar: {
            borderRadius: slate.radius.pill,
            backgroundColor: primaryMain,
            backgroundImage: 'none',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: slate.radius.control,
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
 * Flat "hairline card" treatment — surface background + 1px hairline border, no blur/gradient/
 * tint, no shadow. Elevation is reserved for real sheets/dialogs (which keep MUI's default
 * elevation shadow scale, untouched above); ordinary cards use hairline + flat surface instead.
 * Function name kept from the pre-Reconcile "glass card" treatment so existing call sites
 * (Dashboard/Analysis/AI-Analyst/Groups/Login/Home cards) don't need edits.
 */
export function glassCardSx(theme: Theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    backgroundColor: isDark ? slate.surfaceDark : slate.surface,
    backgroundImage: 'none',
    border: `1px solid ${isDark ? slate.borderDark : slate.border}`,
    boxShadow: 'none',
    borderRadius: slate.radius.surface / 8, // sx shorthand: theme.spacing(1) = 8px by default
  } as const;
}

/**
 * Convenience flat-token export for non-MUI-Theme consumers (inline SVG, chart restyling —
 * TS-DES-105/208). `ceremony` has no dedicated Slate hue (unlike Reconcile's gold) — repointed at
 * `caution` (an amber, still visually distinct from `primary`/`negative`) purely so existing
 * consumers (`chartTheme.ts`'s `categoryPalette`) keep compiling with zero call-site changes;
 * TS-DES-208 owns deciding whether chart series should keep using this key at all.
 */
export function gradientTokens(mode: PaletteMode) {
  return mode === 'dark'
    ? {
        primary: slate.accentDark,
        positive: slate.positiveDark,
        negative: slate.negativeDark,
        ceremony: slate.cautionDark,
        surfaceSecondary: '#232326',
      }
    : {
        primary: slate.accent,
        positive: slate.positive,
        negative: slate.negative,
        ceremony: slate.caution,
        surfaceSecondary: '#F5F5F7',
      };
}

const theme = getTheme('light');
export default theme;
