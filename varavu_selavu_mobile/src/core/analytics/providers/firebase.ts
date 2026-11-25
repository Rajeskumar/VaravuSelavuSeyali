import { AnalyticsProvider } from '../types';

/**
 * Firebase Analytics via React Native Firebase. The only file that knows the vendor. The SDK is
 * required lazily so a build without Firebase (tests, web preview) can still load the app.
 * Automatic screen reporting is disabled natively (firebase.json); screens go through `logScreen`.
 */
export function createFirebaseProvider(): AnalyticsProvider {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const analytics = require('@react-native-firebase/analytics').default;
  const instance = () => analytics();
  return {
    setCollectionEnabled: (enabled) => instance().setAnalyticsCollectionEnabled(enabled),
    logEvent: (name, params) => instance().logEvent(name, params),
    // screen_class repeats the stable name so the SDK never derives a class from the view hierarchy.
    logScreen: (name) => instance().logScreenView({ screen_name: name, screen_class: name }),
    resetIdentity: () => instance().resetAnalyticsData(),
  };
}
