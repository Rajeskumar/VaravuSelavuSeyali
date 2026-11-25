export interface AnalyticsConfig { enabled: boolean; measurementId: string; origin: string; appVersion?: string; debug?: boolean }
export interface Destination { origin: string; measurementId: string }
/** Destinations must match the origin and ID exactly. Build flags control activation. */
export const APPROVED_DESTINATIONS: Partial<Record<'production' | 'staging', Destination>> = {
  production: { origin: 'https://expense.cerebroos.com', measurementId: 'G-X3QFP5HNK2' },
};
export function resolveConfig(env: Record<string, string | undefined>, origin: string,
  destinations = APPROVED_DESTINATIONS): AnalyticsConfig {
  const disabled = { enabled: false, measurementId: '', origin };
  const mode = env.REACT_APP_ANALYTICS_ENV;
  if (env.NODE_ENV !== 'production' || !['production', 'staging'].includes(mode || '')
    || env.REACT_APP_ANALYTICS_ENABLED !== 'true' || env.REACT_APP_ANALYTICS_CONFIG_VERIFIED !== 'true') return disabled;
  const target = destinations[mode as 'production' | 'staging'];
  if (!target || target.origin !== origin || !origin.startsWith('https://')
    || target.measurementId === 'G-0M1N9KSEW5' || !/^G-[A-Z0-9]{6,20}$/.test(target.measurementId)
    || target.measurementId !== env.REACT_APP_GA4_MEASUREMENT_ID
    || (mode === 'staging' && target.measurementId === destinations.production?.measurementId)) return disabled;
  const version = env.REACT_APP_VERSION;
  return { enabled: true, measurementId: target.measurementId, origin, debug: mode === 'staging',
    ...(/^v?\d+\.\d+\.\d+$/.test(version || '') ? { appVersion: version } : {}) };
}
