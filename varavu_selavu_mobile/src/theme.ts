import { StyleSheet, Platform } from 'react-native';

export const theme = {
  colors: {
    primary: '#059669',         // Emerald 600
    primaryLight: '#34D399',    // Emerald 400
    primaryDark: '#047857',     // Emerald 700
    primarySurface: '#ECFDF5',  // Emerald 50
    secondary: '#0EA5E9',       // Sky 500
    background: '#F5F7FA',      // Cool off-white
    surface: '#FFFFFF',
    text: '#1e293b',            // Dark Slate 800
    textSecondary: '#64748b',   // Slate 500
    textTertiary: '#94a3b8',    // Slate 400
    error: '#EF4444',           // Red 500
    errorSurface: '#FEF2F2',    // Red 50
    success: '#10B981',         // Emerald 500
    successSurface: '#ECFDF5',
    warning: '#F59E0B',         // Amber 500
    warningSurface: '#FFFBEB',
    border: '#E2E8F0',          // Slate 200
    borderLight: '#F1F5F9',     // Slate 100
    glass: 'rgba(255, 255, 255, 0.9)',
    glassDark: 'rgba(255, 255, 255, 0.95)',
    gradientStart: '#059669',
    gradientEnd: '#047857',
    overlay: 'rgba(15, 23, 42, 0.6)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 28,
    full: 9999,
  },
  typography: {
    h1: {
      fontSize: 32,
      fontWeight: '800' as const,
      color: '#1e293b',
      letterSpacing: -0.5,
    },
    h2: {
      fontSize: 24,
      fontWeight: '700' as const,
      color: '#1e293b',
      letterSpacing: -0.3,
    },
    h3: {
      fontSize: 20,
      fontWeight: '600' as const,
      color: '#1e293b',
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      color: '#1e293b',
      lineHeight: 24,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: '400' as const,
      color: '#64748b',
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500' as const,
      color: '#64748b',
      letterSpacing: 0.2,
    },
    label: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: '#64748b',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
    },
  },
  shadows: {
    sm: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    colored: {
      shadowColor: '#059669',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 10,
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
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  glassCard: {
    backgroundColor: theme.colors.glass,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    ...theme.shadows.md,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    marginBottom: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    fontSize: 16,
    color: theme.colors.text,
    minHeight: 48,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    ...theme.shadows.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    minHeight: 48,
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    ...theme.typography.h3,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
});
