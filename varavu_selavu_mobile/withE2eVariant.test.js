const {
  assertE2eBuildAllowed,
  applyAndroidCleartext,
  applyIosLocalNetworking,
  isLocalTestBackend,
} = require('./withE2eVariant');

const fs = require('fs');
const path = require('path');

const LOCAL = 'http://localhost:8080';

describe('assertE2eBuildAllowed', () => {
  test('is a no-op for a normal build, whatever else is set', () => {
    expect(() => assertE2eBuildAllowed({})).not.toThrow();
    expect(() => assertE2eBuildAllowed({ EAS_BUILD: 'true', TRACKSPENSE_ENABLE_PUSH: '1' })).not.toThrow();
    expect(() => assertE2eBuildAllowed({ EXPO_PUBLIC_APP_VARIANT: 'staging', EAS_BUILD: 'true' })).not.toThrow();
  });

  test('allows an e2e build with a local test backend', () => {
    expect(() =>
      assertE2eBuildAllowed({ EXPO_PUBLIC_APP_VARIANT: 'e2e', EXPO_PUBLIC_API_URL: LOCAL }),
    ).not.toThrow();
  });

  test.each([
    ['EAS_BUILD', { EAS_BUILD: 'true' }],
    ['EAS_BUILD_PROFILE', { EAS_BUILD_PROFILE: 'production' }],
    ['TRACKSPENSE_ENABLE_PUSH', { TRACKSPENSE_ENABLE_PUSH: '1' }],
  ])('refuses the e2e variant for a distribution build (%s)', (_name, extra) => {
    expect(() =>
      assertE2eBuildAllowed({ EXPO_PUBLIC_APP_VARIANT: 'e2e', EXPO_PUBLIC_API_URL: LOCAL, ...extra }),
    ).toThrow(/e2e/i);
  });

  test.each([undefined, '', 'https://varavu-selavu-backend-952416556244.us-central1.run.app', 'http://192.168.1.2:8080'])(
    'refuses the e2e variant with a missing or non-local URL: %p',
    (url) => {
      expect(() => assertE2eBuildAllowed({ EXPO_PUBLIC_APP_VARIANT: 'e2e', EXPO_PUBLIC_API_URL: url })).toThrow(/e2e/i);
    },
  );
});

describe('isLocalTestBackend agrees with the app-side check', () => {
  test.each([
    ['http://localhost:8080', true],
    ['http://127.0.0.1:18080', true],
    ['http://10.0.2.2:8080', true],
    ['https://localhost:8080', false],
    ['http://localhost', false],
    ['http://localhost:8080/', false],
    ['http://localhost.evil.test:8080', false],
    ['http://user@localhost:8080', false],
    ['', false],
  ])('%p -> %p', (url, ok) => {
    expect(isLocalTestBackend(url)).toBe(ok);
  });
});

describe('platform transforms', () => {
  test('Android: allows cleartext on the application element only', () => {
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
    const out = applyAndroidCleartext(manifest);
    expect(out.manifest.application[0].$['android:usesCleartextTraffic']).toBe('true');
    expect(out.manifest.application[0].$['android:name']).toBe('.MainApplication');
  });

  test('iOS: allows local networking and keeps existing ATS keys', () => {
    const out = applyIosLocalNetworking({ NSAppTransportSecurity: { NSAllowsArbitraryLoads: false } });
    expect(out.NSAppTransportSecurity).toEqual({ NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true });
  });

  test('iOS: creates the ATS dictionary when absent', () => {
    expect(applyIosLocalNetworking({}).NSAppTransportSecurity).toEqual({ NSAllowsLocalNetworking: true });
  });
});

test('the build-side URL rule is textually identical to the runtime rule in src/core/api/baseUrl.ts', () => {
  const pattern = /const LOCAL_TEST_BACKEND = (\/.+\/);/;
  const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').match(pattern)[1];
  expect(read('withE2eVariant.js')).toBe(read('src/core/api/baseUrl.ts'));
});
