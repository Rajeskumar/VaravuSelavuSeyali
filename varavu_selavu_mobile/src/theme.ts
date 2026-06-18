import { StyleSheet } from 'react-native';

/**
 * Premium design tokens.
 * - Primary: Accent Blue #007AFF
 * - Background: iOS System White #FFFFFF
 * - Secondary Surface: iOS System Gray 6 #F2F2F7
 * - Cards: Pure white with diffused iOS-style shadow
 */
export const theme = {
  colors: {
    // Accent Blue — precise, trustworthy
    primary: '#4F46E5', // Indigo
    primaryLight: '#6D64F0',
    primaryDark: '#3730A3',
    primarySurface: '#EEF2FF',
    secondary: '#14B8A6', // Teal

    // Backgrounds — iOS system palette
    background: '#F6F7FB',        // Matches web
    surface: '#FFFFFF',           // Cards and sheets
    surfaceSecondary: '#F2F2F7',  // Inset backgrounds inside cards
    surfaceElevated: '#FFFFFF',   // Elevated overlays

    // Text — standard iOS typographic palette
    text: '#111827',              // Matches web dark
    textSecondary: '#6B7280',     // 60% opacity — iOS secondary label
    textTertiary: '#9CA3AF',      // iOS tertiary label
    textQuaternary: '#C7C7CC',    // iOS quaternary label

    // Semantic signals
    success: '#16A34A',           // System Green
    successSurface: '#E9F9EE',
    error: '#DC2626',             // System Red
    errorSurface: '#FFF0EF',
    warning: '#F59E0B',           // System Orange
    warningSurface: '#FFF4E6',

    // Borders & Dividers — iOS separator
    border: '#E5E7EB',            // iOS separator (opaque)
    borderLight: '#F3F4F6',       // iOS separator (light)

    // Special
    highlight: '#14B8A6',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 32,
    full: 9999,
  },

  typography: {
    fontFamily: {
      regular: 'Inter-Regular',
      medium: 'Inter-Medium',
      semiBold: 'Inter-SemiBold',
      bold: 'Inter-Bold',
      black: 'Inter-Black',
    },
    // iOS "largeTitle" equivalent
    h1: {
      fontFamily: 'Inter-Black',
      fontSize: 34,
      color: '#000000',
      letterSpacing: -0.5,
    },
    // iOS "title1"
    h2: {
      fontFamily: 'Inter-Bold',
      fontSize: 28,
      color: '#000000',
      letterSpacing: -0.3,
    },
    // iOS "title2"
    h3: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 22,
      color: '#000000',
      letterSpacing: -0.2,
    },
    // iOS "headline"
    body: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 17,
      color: '#000000',
    },
    // iOS "body"
    bodyRegular: {
      fontFamily: 'Inter-Regular',
      fontSize: 17,
      color: '#000000',
      lineHeight: 22,
    },
    // iOS "callout"
    callout: {
      fontFamily: 'Inter-Regular',
      fontSize: 16,
      color: '#3C3C43',
    },
    // iOS "subheadline"
    subheadline: {
      fontFamily: 'Inter-Regular',
      fontSize: 15,
      color: '#3C3C43',
    },
    // iOS "footnote"
    footnote: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: '#8E8E93',
    },
    // iOS "caption1"
    caption: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: '#8E8E93',
    },
    label: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 13,
      color: '#8E8E93',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
  },

  shadows: {
    // iOS-style diffused shadow — very soft
    xs: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.10,
      shadowRadius: 28,
      elevation: 8,
    },
    // Colored glow for the FAB
    fab: {
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 10,
    },
    // Floating pill nav bar shadow
    nav: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 12,
    },
    colored: {
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
  },
} as const;

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  // iOS-style inset grouped list section
  listSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  // iOS separator that respects left inset (like Settings app)
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 56,
  },
});
