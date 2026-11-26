const mockAnalyticsProvider = { setCollectionEnabled: jest.fn(), logEvent: jest.fn(), logScreen: jest.fn(), resetIdentity: jest.fn() };
const mockCrashProvider = { setCollectionEnabled: jest.fn(), recordError: jest.fn(), log: jest.fn(), setAttribute: jest.fn(), crash: jest.fn() };
const mockCreateAnalytics = jest.fn(() => mockAnalyticsProvider);
const mockCreateCrash = jest.fn(() => mockCrashProvider);
jest.mock('../core/analytics/providers/firebase', () => ({ createFirebaseProvider: () => mockCreateAnalytics() }));
jest.mock('../core/analytics/providers/crashFirebase', () => ({ createFirebaseCrashProvider: () => mockCreateCrash() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' }, nativeBuildVersion: '42' } }));

import { analytics, crashReporter, getAnalyticsEnvironment } from '../core/analytics';
import { setupAnalytics } from './analytics';

const original = { ...process.env };
function run(env: Record<string, string | undefined>, dev = false) {
  jest.clearAllMocks();
  mockCreateAnalytics.mockImplementation(() => mockAnalyticsProvider);
  mockCreateCrash.mockImplementation(() => mockCrashProvider);
  delete process.env.EXPO_PUBLIC_ANALYTICS_ENV; delete process.env.EXPO_PUBLIC_APP_VARIANT;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  (global as unknown as { __DEV__: boolean }).__DEV__ = dev;
  setupAnalytics();
  analytics.setConsent(true); crashReporter.setConsent(true);
}
afterAll(() => { process.env = original; (global as unknown as { __DEV__: boolean }).__DEV__ = true; });

test('an unconfigured build never creates a Firebase SDK, even after opt-in', () => {
  run({});
  expect(getAnalyticsEnvironment()).toBe('off');
  expect(mockCreateAnalytics).not.toHaveBeenCalled();
  expect(mockCreateCrash).not.toHaveBeenCalled();
  expect(analytics.track('logout', {})).toBe(false);
  expect(analytics.isEnabled()).toBe(false);
  expect(crashReporter.isEnabled()).toBe(false);
});
test('look-alike values, development production and the e2e variant all stay off', () => {
  for (const [env, dev] of [[{ EXPO_PUBLIC_ANALYTICS_ENV: 'prod' }, false], [{ EXPO_PUBLIC_ANALYTICS_ENV: 'true' }, false],
    [{ EXPO_PUBLIC_ANALYTICS_ENV: 'production' }, true],
    [{ EXPO_PUBLIC_ANALYTICS_ENV: 'qa', EXPO_PUBLIC_APP_VARIANT: 'e2e' }, false],
    [{ EXPO_PUBLIC_ANALYTICS_ENV: 'production', EXPO_PUBLIC_APP_VARIANT: 'e2e' }, false]] as const) {
    run(env, dev);
    expect(getAnalyticsEnvironment()).toBe('off');
    expect(mockCreateAnalytics).not.toHaveBeenCalled();
  }
});
test('qa and production builds create the SDKs, and events flow only after opt-in', () => {
  run({ EXPO_PUBLIC_ANALYTICS_ENV: 'qa' }, true);
  expect(getAnalyticsEnvironment()).toBe('qa');
  expect(mockCreateAnalytics).toHaveBeenCalledTimes(1);
  expect(mockAnalyticsProvider.setCollectionEnabled).toHaveBeenCalledWith(true);
  expect(analytics.track('logout', {})).toBe(true);
  expect(mockAnalyticsProvider.logEvent).toHaveBeenCalledWith('logout', expect.objectContaining({ product: 'trackspense', feature: 'auth', platform: 'ios' }));
  run({ EXPO_PUBLIC_ANALYTICS_ENV: 'production' }, false);
  expect(getAnalyticsEnvironment()).toBe('production');
});
test('crash attributes are build, version, environment and platform only; breadcrumbs follow accepted events', () => {
  run({ EXPO_PUBLIC_ANALYTICS_ENV: 'qa' });
  const keys = mockCrashProvider.setAttribute.mock.calls.map((c) => c[0]).sort();
  expect(keys).toEqual(['app_version', 'build', 'env', 'platform']);
  analytics.track('logout', {});
  expect(mockCrashProvider.log).toHaveBeenCalledWith('logout');
  analytics.track('login', { authentication_method: 'someone@example.test' });
  expect(mockCrashProvider.log).toHaveBeenCalledTimes(1); // a rejected event leaves no breadcrumb
});
test('the test crash exists in qa builds only', () => {
  run({ EXPO_PUBLIC_ANALYTICS_ENV: 'qa' });
  expect(crashReporter.testCrash()).toBe(true);
  run({ EXPO_PUBLIC_ANALYTICS_ENV: 'production' });
  expect(crashReporter.testCrash()).toBe(false);
});
test('a Firebase SDK that cannot be created leaves a working, disabled app', () => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_ANALYTICS_ENV = 'qa'; delete process.env.EXPO_PUBLIC_APP_VARIANT;
  mockCreateAnalytics.mockImplementation(() => { throw new Error('no GoogleService config'); });
  mockCreateCrash.mockImplementation(() => { throw new Error('no GoogleService config'); });
  expect(() => setupAnalytics()).not.toThrow();
  analytics.setConsent(true); crashReporter.setConsent(true);
  expect(analytics.track('logout', {})).toBe(false);
  expect(crashReporter.isEnabled()).toBe(false);
});
