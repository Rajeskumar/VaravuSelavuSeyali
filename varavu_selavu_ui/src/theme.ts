import { createTheme, PaletteMode, Theme } from '@mui/material/styles';

// "Apple structure, Revolut color": a mostly neutral, spacious Apple-style
// canvas (apple.com grays, SF-style type, big pill buttons) carrying a single
// vivid gradient accent — Apple's own system Blue → Purple — used deliberately
// for CTAs, active states, and data highlights rather than washed everywhere.
export const brand = {
  gradientStart: '#007AFF', // Apple system Blue (light)
  gradientEnd: '#AF52DE', // Apple system Purple
  gradientStartDark: '#0A84FF', // Apple system Blue (dark)
  gradientEndDark: '#BF5AF2', // Apple system Purple (dark)
  pop: '#FF2D55', // Apple system Pink — sparing use (badges, highlights)
  popDark: '#FF375F',
};

/** Apple's own scroll/reveal easing — a fast-out, gentle-settle deceleration. */
export const motion = {
  easing: [0.16, 1, 0.3, 1] as const,
  easingCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
  fast: 0.2,
  base: 0.4,
  slow: 0.7,
};

export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Shared "frosted glass" card treatment (gradient tint + soft border + glow shadow)
 * used across dashboard/analysis/chat cards. Centralized so every card stays
 * legible in both light and dark mode instead of each file hardcoding its own
 * light-only pastel gradient.
 */
export function glassCardSx(theme: Theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    backdropFilter: 'blur(20px)',
    background: isDark
      ? `linear-gradient(135deg, ${withAlpha(brand.gradientStartDark, 0.14)} 0%, ${withAlpha(brand.gradientEndDark, 0.1)} 100%)`
      : `linear-gradient(135deg, ${withAlpha(brand.gradientStart, 0.06)} 0%, ${withAlpha(brand.gradientEnd, 0.06)} 100%)`,
    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
    boxShadow: isDark
      ? '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)'
      : '0 20px 40px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
    // Kept in proportion to typical card padding (16-24px) — much bigger than
    // this and the curve crowds titles/icons sitting at the padding edge.
    borderRadius: 1.5,
  } as const;
}

export function getTheme(mode: PaletteMode): Theme {
  const isDark = mode === 'dark';

  const primaryMain = isDark ? brand.gradientStartDark : brand.gradientStart;
  const secondaryMain = isDark ? brand.gradientEndDark : brand.gradientEnd;
  const gradientStart = isDark ? brand.gradientStartDark : brand.gradientStart;
  const gradientEnd = isDark ? brand.gradientEndDark : brand.gradientEnd;

  // Apple.com's own neutral scale.
  const backgroundDefault = isDark ? '#000000' : '#F5F5F7';
  const backgroundPaper = isDark ? '#1C1C1E' : '#FFFFFF';

  const textPrimary = isDark ? '#F5F5F7' : '#1D1D1F';
  const textSecondary = isDark ? '#98989D' : '#6E6E73';

  const navGlass = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.72)';
  const paperGlass = isDark ? 'rgba(28,28,30,0.6)' : 'rgba(255,255,255,0.6)';
  const paperGlassBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: secondaryMain },
      background: { default: backgroundDefault, paper: backgroundPaper },
      success: { main: isDark ? '#30D158' : '#34C759' },
      error: { main: isDark ? '#FF453A' : '#FF3B30' },
      warning: { main: isDark ? '#FF9F0A' : '#FF9500' },
      text: { primary: textPrimary, secondary: textSecondary },
      divider: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, Roboto, Helvetica, Arial, sans-serif',
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
            backgroundColor: backgroundDefault,
            backgroundImage: isDark
              ? `radial-gradient(circle at 15% 0%, ${withAlpha(gradientStart, 0.14)} 0%, transparent 45%), radial-gradient(circle at 85% 20%, ${withAlpha(gradientEnd, 0.1)} 0%, transparent 40%)`
              : `radial-gradient(circle at 15% 0%, ${withAlpha(gradientStart, 0.05)} 0%, transparent 45%), radial-gradient(circle at 85% 20%, ${withAlpha(gradientEnd, 0.05)} 0%, transparent 40%)`,
            backgroundRepeat: 'no-repeat',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: paperGlass,
            backdropFilter: 'blur(20px)',
            backgroundImage: 'none',
            border: `1px solid ${paperGlassBorder}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            boxShadow: isDark
              ? `0 4px 24px rgba(0,0,0,0.4)`
              : `0 2px 20px rgba(0,0,0,0.05)`,
            transition: `transform ${motion.base}s ${motion.easingCss}, box-shadow ${motion.base}s ${motion.easingCss}`,
            '&:hover': {
              transform: 'translateY(-3px)',
              boxShadow: isDark
                ? `0 12px 32px rgba(0,0,0,0.5)`
                : `0 12px 32px rgba(0,0,0,0.1)`,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 980, // Apple's signature pill button
            paddingLeft: 22,
            paddingRight: 22,
            boxShadow: 'none',
            transition: `all ${motion.fast}s ${motion.easingCss}`,
            '&:hover': {
              boxShadow: 'none',
              transform: 'scale(1.02)',
            },
            '&:active': {
              transform: 'scale(0.98)',
            },
          },
          containedPrimary: {
            backgroundImage: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
            '&:hover': {
              backgroundImage: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
              filter: 'brightness(1.08)',
            },
          },
          sizeLarge: {
            paddingTop: 12,
            paddingBottom: 12,
            fontSize: '1.05rem',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: navGlass,
            color: textPrimary,
            backdropFilter: 'blur(20px) saturate(1.8)',
            boxShadow: 'none',
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: navGlass,
            color: textPrimary,
            backdropFilter: 'blur(20px)',
            borderRight: `1px solid ${paperGlassBorder}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 980,
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
            borderRadius: 980,
            backgroundColor: isDark ? withAlpha(primaryMain, 0.2) : withAlpha(primaryMain, 0.1),
          },
          bar: {
            borderRadius: 980,
            backgroundImage: `linear-gradient(90deg, ${gradientStart}, ${gradientEnd})`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
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

/** Convenience token export for non-MUI usages (e.g. inline SVG gradients). */
export function gradientTokens(mode: PaletteMode) {
  return mode === 'dark'
    ? { start: brand.gradientStartDark, end: brand.gradientEndDark, surfaceSecondary: '#2C2C2E' }
    : { start: brand.gradientStart, end: brand.gradientEnd, surfaceSecondary: '#F5F5F7' };
}

const theme = getTheme('light');
export default theme;
