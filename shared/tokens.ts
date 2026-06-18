export const BrandTokens = {
  colors: {
    // Primary - Indigo
    primary: '#4F46E5',
    primaryLight: '#6D64F0',
    primaryDark: '#3730A3',
    primarySurface: '#EEF2FF',

    // Secondary / Accent - Teal
    secondary: '#14B8A6',
    highlight: '#14B8A6',

    // Backgrounds
    background: '#F6F7FB',
    surface: '#FFFFFF',
    surfaceSecondary: '#F2F2F7',
    surfaceElevated: '#FFFFFF',

    // Text
    text: '#111827',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    textQuaternary: '#C7C7CC', // Kept for iOS style subtle text

    // Semantics
    success: '#16A34A',
    successSurface: '#E9F9EE',
    error: '#DC2626',
    errorSurface: '#FFF0EF',
    warning: '#F59E0B',
    warningSurface: '#FFF4E6',

    // Borders
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
  },
  gradients: {
    brand: 'linear-gradient(135deg, rgba(79,70,229,0.85) 0%, rgba(20,184,166,0.85) 100%)',
    brandSolid: 'linear-gradient(135deg, #4F46E5 0%, #14B8A6 100%)',
  }
} as const;
