import { AnalyticsProvider } from '../types';

/** Default provider: development, tests, web preview, E2E and any unconfigured build. */
export const noopProvider: AnalyticsProvider = {
  setCollectionEnabled() {},
  logEvent() {},
  logScreen() {},
  resetIdentity() {},
};
