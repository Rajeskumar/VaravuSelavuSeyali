import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  configureAnalytics, configureCrashReporter, crashReporter, resolveAnalyticsEnvironment, setAnalyticsEnvironment,
} from '../core/analytics';
import { installFatalErrorSanitizer, installRejectionSanitizer } from '../core/analytics/crash';
import { createFirebaseProvider } from '../core/analytics/providers/firebase';
import { createFirebaseCrashProvider } from '../core/analytics/providers/crashFirebase';
import { registerAuthObserver } from '../core/auth/authObserver';
import { logger } from '../core/logger';
import { trackAuthEvent } from '../features/shared/analytics/auth';
import { eventInvariant, terminalFamily, trackSpenseEvents } from '../features/shared/analytics/events';

/**
 * Wires TrackSpense's event table and the Firebase SDKs. Firebase is created only when the build explicitly
 * opts in (EXPO_PUBLIC_ANALYTICS_ENV, read statically so Expo inlines it); every other build gets disabled
 * clients and a disabled crash reporter. Nothing is collected until the user has opted in to each category.
 */
export function setupAnalytics(): void {
  const environment = resolveAnalyticsEnvironment({
    env: process.env.EXPO_PUBLIC_ANALYTICS_ENV,
    variant: process.env.EXPO_PUBLIC_APP_VARIANT,
    dev: __DEV__,
  });
  setAnalyticsEnvironment(environment);
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
  const on = environment !== 'off' && !!platform;

  let provider;
  let crashProvider;
  if (on) {
    try { provider = createFirebaseProvider(); } catch { logger.warn('Analytics unavailable: Firebase SDK could not be created'); }
    try { crashProvider = createFirebaseCrashProvider(); } catch { logger.warn('Crash reporting unavailable: Firebase SDK could not be created'); }
  }

  const version = Constants.expoConfig?.version;
  configureCrashReporter({
    provider: crashProvider,
    environment: environment === 'off' ? undefined : environment,
    attributes: { app_version: version, build: Constants.nativeBuildVersion ?? undefined, env: environment, platform: platform ?? undefined },
  });
  if (on) {
    // Installed whenever analytics is on, even if the crash provider failed to build part-way (the SDK installs its
    // handlers in its constructor, so a half-built module could still have a raw handler). After the SDK constructed (above): sit in front of its own handlers so no raw message reaches it.
    // Release builds always sanitize (the SDK's own consent flag is native and can differ from ours before our
    // consent store has loaded). Development builds keep their red box and sanitize only while collecting.
    installFatalErrorSanitizer((globalThis as { ErrorUtils?: never }).ErrorUtils, () => !__DEV__ || crashReporter.isEnabled());
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      installRejectionSanitizer(require('promise/setimmediate/rejection-tracking'), (error) => crashReporter.recordError(error));
    } catch { logger.warn('Rejection tracking sanitizer unavailable'); }
  }

  configureAnalytics({
    provider,
    events: trackSpenseEvents,
    platform: platform ?? 'ios',
    product: 'trackspense',
    appVersion: version && /^\d+\.\d+\.\d+$/.test(version) ? version : undefined,
    terminalFamily,
    invariant: eventInvariant,
    onTracked: (name) => crashReporter.breadcrumb(name),
  });
  registerAuthObserver(trackAuthEvent);
}
