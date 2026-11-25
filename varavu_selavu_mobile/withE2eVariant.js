/**
 * Native E2E build variant (qa/mobile). Set EXPO_PUBLIC_APP_VARIANT=e2e (with EXPO_PUBLIC_API_URL
 * pointing at the local test backend) while running `expo prebuild` and the native build.
 *
 * For any other build this plugin does nothing. For the e2e variant it
 *  1. refuses to run for a distribution build (EAS, a push-enabled build) or without a local test URL,
 *     so a test-configured binary cannot be produced by the release path, and
 *  2. allows cleartext HTTP for the local backend: Android `usesCleartextTraffic` (app-wide: the manifest cannot scope it to
 *     one host; the API origin itself is pinned to a local test backend by baseUrl.ts and this plugin's URL guard), iOS
 *     `NSAllowsLocalNetworking`. These exceptions exist only in e2e binaries.
 * The runtime counterpart is src/core/api/baseUrl.ts; keep LOCAL_TEST_BACKEND identical (a Jest test
 * checks the two agree).
 */
const LOCAL_TEST_BACKEND = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2):\d{2,5}$/;

function isLocalTestBackend(url) {
  return typeof url === 'string' && LOCAL_TEST_BACKEND.test(url);
}

function assertE2eBuildAllowed(env) {
  if (env.EXPO_PUBLIC_APP_VARIANT !== 'e2e') return;
  const reasons = [];
  if (env.EAS_BUILD) reasons.push('EAS_BUILD is set (EAS builds are distribution builds)');
  if (env.EAS_BUILD_PROFILE) reasons.push(`EAS_BUILD_PROFILE=${env.EAS_BUILD_PROFILE}`);
  if (env.TRACKSPENSE_ENABLE_PUSH === '1') reasons.push('TRACKSPENSE_ENABLE_PUSH=1 (push-enabled builds are release builds)');
  if (!isLocalTestBackend(env.EXPO_PUBLIC_API_URL)) {
    reasons.push('EXPO_PUBLIC_API_URL must be http://localhost|127.0.0.1|10.0.2.2:<port>');
  }
  if (reasons.length) {
    throw new Error(`Refusing to build the e2e variant: ${reasons.join('; ')}.`);
  }
}

function applyAndroidCleartext(manifest) {
  const application = manifest.manifest.application && manifest.manifest.application[0];
  if (application) application.$['android:usesCleartextTraffic'] = 'true';
  return manifest;
}

function applyIosLocalNetworking(plist) {
  plist.NSAppTransportSecurity = { ...(plist.NSAppTransportSecurity || {}), NSAllowsLocalNetworking: true };
  return plist;
}

function withE2eVariant(config) {
  assertE2eBuildAllowed(process.env);
  if (process.env.EXPO_PUBLIC_APP_VARIANT !== 'e2e') return config;
  // Required lazily: the pure helpers above are unit-tested under jest-expo, which cannot load this package.
  const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');
  config = withAndroidManifest(config, (c) => {
    c.modResults = applyAndroidCleartext(c.modResults);
    return c;
  });
  return withInfoPlist(config, (c) => {
    c.modResults = applyIosLocalNetworking(c.modResults);
    return c;
  });
}

module.exports = withE2eVariant;
module.exports.assertE2eBuildAllowed = assertE2eBuildAllowed;
module.exports.applyAndroidCleartext = applyAndroidCleartext;
module.exports.applyIosLocalNetworking = applyIosLocalNetworking;
module.exports.isLocalTestBackend = isLocalTestBackend;
