import { createTheme, PaletteMode, Theme } from '@mui/material/styles';

// Vibrant emerald → sky brand
export const brand = {
  gradientStart: '#10B981',
  gradientEnd: '#0EA5E9',
  gradientStartDark: '#34D399',
  gradientEndDark: '#38BDF8',
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
    backdropFilter: 'blur(8px)',
    background: isDark
      ? `linear-gradient(135deg, ${withAlpha(brand.gradientStartDark, 0.16)} 0%, ${withAlpha(brand.gradientEndDark, 0.12)} 100%)`
      : `linear-gradient(135deg, ${withAlpha(brand.gradientStart, 0.08)} 0%, ${withAlpha(brand.gradientEnd, 0.08)} 100%)`,
    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.35)',
    boxShadow: isDark
      ? '0 10px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)'
      : '0 10px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
    borderRadius: 3,
  } as const;
}

export function getTheme(mode: PaletteMode): Theme {
  const isDark = mode === 'dark';

  const primaryMain = isDark ? '#34D399' : '#10B981';
  const secondaryMain = isDark ? '#38BDF8' : '#0EA5E9';
  const gradientStart = isDark ? brand.gradientStartDark : brand.gradientStart;
  const gradientEnd = isDark ? brand.gradientEndDark : brand.gradientEnd;

  const backgroundDefault = isDark ? '#0D0B14' : '#F7F5FC';
  const backgroundPaper = isDark ? '#18141F' : '#FFFFFF';
  const surfaceSecondary = isDark ? '#221D2F' : '#F1EEFA';

  const textPrimary = isDark ? '#F5F3FA' : '#150F23';
  const textSecondary = isDark ? '#B4AEC4' : '#635E75';

  const paperGlass = isDark ? 'rgba(24,20,31,0.55)' : 'rgba(255,255,255,0.45)';
  const paperGlassBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)';

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain },
      secondary: { main: secondaryMain },
      background: { default: backgroundDefault, paper: backgroundPaper },
      success: { main: isDark ? '#34D399' : '#16A34A' },
      error: { main: isDark ? '#F87171' : '#EF4444' },
      warning: { main: isDark ? '#FBBF24' : '#F59E0B' },
      text: { primary: textPrimary, secondary: textSecondary },
      divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(21,15,35,0.08)',
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
      fontSize: 15,
      h5: { fontWeight: 700 },
      button: { fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: backgroundDefault,
            backgroundImage: isDark
              ? `radial-gradient(circle at 15% 0%, ${withAlpha(gradientStart, 0.16)} 0%, transparent 45%), radial-gradient(circle at 85% 20%, ${withAlpha(gradientEnd, 0.12)} 0%, transparent 40%)`
              : `radial-gradient(circle at 15% 0%, ${withAlpha(gradientStart, 0.08)} 0%, transparent 45%), radial-gradient(circle at 85% 20%, ${withAlpha(gradientEnd, 0.08)} 0%, transparent 40%)`,
            backgroundRepeat: 'no-repeat',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: paperGlass,
            backdropFilter: 'blur(16px)',
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
              ? `0 4px 20px ${withAlpha(gradientStart, 0.25)}, 0 1px 4px rgba(0,0,0,0.3)`
              : `0 2px 16px ${withAlpha(gradientStart, 0.1)}, 0 1px 4px rgba(0,0,0,0.04)`,
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: isDark
                ? `0 8px 28px ${withAlpha(gradientStart, 0.35)}`
                : `0 8px 24px ${withAlpha(gradientStart, 0.16)}`,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 12,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: isDark ? '0px 4px 14px rgba(0,0,0,0.4)' : '0px 4px 14px rgba(0,0,0,0.15)',
            },
          },
          containedPrimary: {
            backgroundImage: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
            '&:hover': {
              backgroundImage: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
              filter: 'brightness(1.08)',
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: `linear-gradient(135deg, ${withAlpha(gradientStart, 0.75)}, ${withAlpha(gradientEnd, 0.75)})`,
            color: '#fff',
            backdropFilter: 'blur(16px)',
            boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.1)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: isDark
              ? `linear-gradient(160deg, ${withAlpha(gradientStart, 0.28)}, ${backgroundDefault} 55%)`
              : `linear-gradient(160deg, ${withAlpha(gradientStart, 0.16)}, ${withAlpha(gradientEnd, 0.1)})`,
            color: textPrimary,
            backdropFilter: 'blur(16px)',
            borderRight: `1px solid ${paperGlassBorder}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            '&.MuiChip-filledPrimary': {
              backgroundColor: isDark ? withAlpha(primaryMain, 0.2) : '#F1EBFE',
              color: primaryMain,
            },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? withAlpha(primaryMain, 0.2) : '#F1EBFE',
          },
          bar: {
            backgroundImage: `linear-gradient(90deg, ${gradientStart}, ${gradientEnd})`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              background: `linear-gradient(135deg, ${withAlpha(gradientStart, isDark ? 0.35 : 0.16)}, ${withAlpha(gradientEnd, isDark ? 0.35 : 0.16)})`,
              '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                color: primaryMain,
              },
              '&:hover': {
                background: `linear-gradient(135deg, ${withAlpha(gradientStart, isDark ? 0.45 : 0.24)}, ${withAlpha(gradientEnd, isDark ? 0.45 : 0.24)})`,
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
    ? { start: brand.gradientStartDark, end: brand.gradientEndDark, surfaceSecondary: '#221D2F' }
    : { start: brand.gradientStart, end: brand.gradientEnd, surfaceSecondary: '#F1EEFA' };
}

const theme = getTheme('light');
export default theme;
