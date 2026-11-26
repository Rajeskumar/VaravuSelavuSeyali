import { CrashProvider } from '../crash';

/**
 * Firebase Crashlytics via React Native Firebase. The only file that knows the vendor SDK. Required lazily so
 * a build without it (tests, web preview) still loads. Collection is off natively (firebase.json) until consent.
 */
export function createFirebaseCrashProvider(): CrashProvider {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getCrashlytics } = require('@react-native-firebase/crashlytics');
  const instance = () => getCrashlytics();
  // Constructing the module installs the SDK's own JS error and promise-rejection handlers, so do it now:
  // the sanitizing wrappers (crash.ts) must be installed afterwards to sit in front of them.
  instance();
  return {
    setCollectionEnabled: (enabled) => instance().setCrashlyticsCollectionEnabled(enabled),
    recordError: (error) => instance().recordError(error),
    log: (message) => instance().log(message),
    setAttribute: (key, value) => instance().setAttribute(key, value),
    crash: () => instance().crash(),
    deleteUnsentReports: () => instance().deleteUnsentReports(),
  };
}
