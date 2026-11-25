import type { Operation } from './types';
import { AnalyticsClient, AnalyticsClientOptions, createAnalyticsClient } from './client';
import { CrashReporter, CrashReporterOptions, createCrashReporter } from './crash';

import { AnalyticsEnvironment } from './environment';
export { resolveAnalyticsEnvironment } from './environment';
export type { AnalyticsEnvironment } from './environment';
export type { AnalyticsProvider, EventTable, Operation } from './types';

// Until an app configures analytics this is a disabled client, so core and tests are always safe.
let client: AnalyticsClient = createAnalyticsClient({ provider: undefined, events: {}, platform: 'ios', product: '' });

/** Called once, before first render, by the app. Replaces any previous client. */
export function configureAnalytics(options: AnalyticsClientOptions): void {
  client = createAnalyticsClient(options);
}

/** Stable facade: callers import this once and always reach the current client. */
export const analytics = {
  setConsent: (value: boolean) => client.setConsent(value),
  isEnabled: () => client.isEnabled(),
  resetIdentity: () => client.resetIdentity(),
  // Never throws: a dead operation simply emits nothing.
  beginOperation: (): Operation => { try { return client.beginOperation(); } catch { return { generation: -1, token: {} }; } },
  track: (name: string, properties: Record<string, string>, operation?: Parameters<AnalyticsClient['track']>[2]) =>
    client.track(name, properties, operation),
  trackScreen: (screenName: string) => client.trackScreen(screenName),
};

let reporter: CrashReporter = createCrashReporter({ provider: undefined, attributes: {} });

/** Called once, before first render, by the app. */
export function configureCrashReporter(options: CrashReporterOptions): void {
  reporter = createCrashReporter(options);
}

/** Stable facade for crash reporting; a disabled reporter until configured. */
export const crashReporter = {
  setConsent: (granted: boolean) => reporter.setConsent(granted),
  isEnabled: () => reporter.isEnabled(),
  recordError: (error: unknown) => reporter.recordError(error),
  breadcrumb: (eventName: string) => reporter.breadcrumb(eventName),
  testCrash: () => reporter.testCrash(),
};

let currentEnvironment: AnalyticsEnvironment = 'off';
/** Set by the app at start-up; read by QA-only UI such as the test-crash control. */
export function setAnalyticsEnvironment(environment: AnalyticsEnvironment): void { currentEnvironment = environment; }
export const getAnalyticsEnvironment = (): AnalyticsEnvironment => currentEnvironment;
/** False in development, test and E2E builds: nothing can be collected there, so nothing is asked or shown. */
export const isAnalyticsAvailable = (): boolean => currentEnvironment !== 'off';
