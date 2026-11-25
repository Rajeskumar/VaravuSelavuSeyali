import { getAppConfig } from '../config/appConfig';

// In Expo, localhost refers to the device itself. To reach a backend on the host machine use
// 10.0.2.2 (Android emulator), localhost (iOS simulator) or the machine's LAN IP (physical device),
// via the EXPO_PUBLIC_API_URL development override.
//
// Native E2E builds (qa/mobile) are optimised Release builds, so `__DEV__` is false and the override
// above would be ignored. They opt in with EXPO_PUBLIC_APP_VARIANT=e2e instead, and in that variant
// the override is mandatory and restricted to an origin of the local test backend: a test build that
// is missing its URL, or points anywhere else (production included), fails loudly rather than quietly
// talking to the wrong server. Both variables are compiled into the bundle (public config, not
// secrets); production builds never set them and the build guards in qa/mobile and
// withE2eVariant.js reject the variant for distribution builds.

/** Origin only (no path, credentials or trailing slash), plain http, explicit port. */
const LOCAL_TEST_BACKEND = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2):\d{2,5}$/;

export function getApiBaseUrl(): string {
  const configured = getAppConfig().api.baseUrl;
  // Static `process.env.EXPO_PUBLIC_*` reads: the Expo bundler only inlines them in this form.
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (process.env.EXPO_PUBLIC_APP_VARIANT === 'e2e' && !__DEV__) {
    if (!override || !LOCAL_TEST_BACKEND.test(override)) {
      throw new Error(
        'e2e build: EXPO_PUBLIC_API_URL must be the local test backend origin ' +
          '(http://localhost|127.0.0.1|10.0.2.2:<port>).',
      );
    }
    return override;
  }
  return __DEV__ ? (override || configured) : configured;
}
