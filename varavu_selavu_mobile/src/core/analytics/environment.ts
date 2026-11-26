export type AnalyticsEnvironment = 'production' | 'qa' | 'off';

/**
 * Analytics is on only when a build says so explicitly (`EXPO_PUBLIC_ANALYTICS_ENV`), never because of
 * Debug vs Release alone. The E2E variant, development builds asking for production, unset and
 * unknown values are all `off`. `qa` may run in a development build so DebugView can be checked.
 */
export function resolveAnalyticsEnvironment(input: {
  env: string | undefined;
  variant: string | undefined;
  dev: boolean;
}): AnalyticsEnvironment {
  if (input.variant === 'e2e') return 'off';
  if (input.env === 'qa') return 'qa';
  if (input.env === 'production' && !input.dev) return 'production';
  return 'off';
}
