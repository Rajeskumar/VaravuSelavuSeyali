/**
 * Every SecureStore key core owns, in one place. The VALUES are persisted on users' devices —
 * changing one signs everyone out (or resets their theme), so never rename them.
 * Feature-owned keys (AI consent, expense draft, ...) live beside their features.
 */
export const STORAGE_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  userEmail: 'user_email',
  themePreference: 'vs_theme_preference',
} as const;
