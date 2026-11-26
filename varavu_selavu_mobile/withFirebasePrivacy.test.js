const { applyAndroidManifest, applyPodfile, ANDROID_PERMISSIONS_TO_REMOVE } = require('./withFirebasePrivacy');
const { resolveFirebase, applyFirebase } = require('./firebaseConfig');
const { transformAppDelegate } = require('./withSceneLifecycle');
const fs = require('fs');
const path = require('path');

describe('Android manifest', () => {
  const manifest = () => ({ manifest: { $: { 'xmlns:android': 'a' }, 'uses-permission': [
    { $: { 'android:name': 'android.permission.INTERNET' } },
    { $: { 'android:name': 'com.google.android.gms.permission.AD_ID' } },
  ] } });
  test('removes every advertising permission via tools:node=remove and keeps the others', () => {
    const out = applyAndroidManifest(manifest()).manifest;
    expect(out.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    const byName = Object.fromEntries(out['uses-permission'].map((p) => [p.$['android:name'], p.$['tools:node']]));
    for (const name of ANDROID_PERMISSIONS_TO_REMOVE) expect(byName[name]).toBe('remove');
    expect(byName['android.permission.INTERNET']).toBeUndefined();
    expect(ANDROID_PERMISSIONS_TO_REMOVE).toEqual(expect.arrayContaining([
      'com.google.android.gms.permission.AD_ID', 'android.permission.ACCESS_ADSERVICES_AD_ID']));
  });
  test('is idempotent', () => {
    const once = applyAndroidManifest(manifest());
    const twice = applyAndroidManifest(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});

describe('Podfile', () => {
  test('builds analytics without ad-id support, once', () => {
    const out = applyPodfile("platform :ios, '17.0'\n");
    expect(out).toContain('$RNFirebaseAnalyticsWithoutAdIdSupport = true');
    expect(applyPodfile(out)).toBe(out);
  });
});

describe('firebase.json (read by both platforms at build time)', () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase.json'), 'utf8'))['react-native'];
  test('collection is off until consent, automatic screens and ad features are off', () => {
    expect(json.analytics_auto_collection_enabled).toBe(false);
    expect(json.crashlytics_auto_collection_enabled).toBe(false);
    expect(json.google_analytics_automatic_screen_reporting_enabled).toBe(false);
    expect(json.google_analytics_adid_collection_enabled).toBe(false);
    expect(json.google_analytics_ssaid_collection_enabled).toBe(false);
    expect(json.google_analytics_registration_with_ad_network_enabled).toBe(false);
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization_signals']) expect(json[`analytics_default_allow_${k}`]).toBe(false);
  });
});

describe('Firebase native config selection (environment isolation)', () => {
  const plistFor = (project, bundle = 'com.cerebroos.trackspense') =>
    `<plist><dict><key>PROJECT_ID</key><string>${project}</string><key>BUNDLE_ID</key><string>${bundle}</string></dict></plist>`;
  const jsonFor = (project, pkg = 'com.cerebroos.trackspense') => JSON.stringify({
    project_info: { project_id: project }, client: [{ client_info: { android_client_info: { package_name: pkg } } }] });
  const contents = { '/f/GoogleService-Info.plist': plistFor('trackspense-dev'), '/f/google-services.json': jsonFor('trackspense-dev') };
  const exists = (p) => p in contents;
  const read = (p) => contents[p];
  const resolve = (env) => resolveFirebase(env, exists, read);
  const env = { GOOGLE_SERVICES_PLIST: '/f/GoogleService-Info.plist', GOOGLE_SERVICES_JSON: '/f/google-services.json', FIREBASE_EXPECTED_PROJECT_ID: 'trackspense-dev' };
  test.each([
    [{}], [{ EXPO_PUBLIC_ANALYTICS_ENV: '' }], [{ EXPO_PUBLIC_ANALYTICS_ENV: 'prod' }], [{ EXPO_PUBLIC_ANALYTICS_ENV: 'staging' }],
    [{ EXPO_PUBLIC_ANALYTICS_ENV: 'qa', EXPO_PUBLIC_APP_VARIANT: 'e2e' }],
    [{ EXPO_PUBLIC_ANALYTICS_ENV: 'production', EXPO_PUBLIC_APP_VARIANT: 'e2e' }],
  ])('no Firebase for %p, even if config files exist', (extra) => {
    const resolved = resolve({ ...env, ...extra });
    expect(resolved.enabled).toBe(false);
    const base = { name: 'x', plugins: ['a'] };
    expect(applyFirebase(base, resolved)).toBe(base);
  });
  test.each(['qa', 'production'])('%s adds the SDK plugins and both config files', (mode) => {
    const resolved = resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: mode });
    const out = applyFirebase({ ios: { bundleIdentifier: 'b' }, android: { package: 'p' }, plugins: ['a'] }, resolved);
    expect(out.ios).toEqual({ bundleIdentifier: 'b', googleServicesFile: '/f/GoogleService-Info.plist' });
    expect(out.android).toEqual({ package: 'p', googleServicesFile: '/f/google-services.json' });
    expect(out.plugins).toEqual(['a', '@react-native-firebase/app', '@react-native-firebase/crashlytics']);
  });
  test('a qa or production build with a missing or unset config file fails loudly', () => {
    expect(() => resolve({ EXPO_PUBLIC_ANALYTICS_ENV: 'production' })).toThrow(/GOOGLE_SERVICES_PLIST.*GOOGLE_SERVICES_JSON/s);
    expect(() => resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'qa', GOOGLE_SERVICES_JSON: '/nope.json' })).toThrow(/GOOGLE_SERVICES_JSON/);
  });
  test('the two files must be one Firebase project and this app (a mixed-up pair fails the build)', () => {
    contents['/f/other.json'] = jsonFor('trackspense-prod');
    contents['/f/wrong-bundle.plist'] = plistFor('trackspense-dev', 'com.example.other');
    contents['/f/wrong-package.json'] = jsonFor('trackspense-dev', 'com.example.other');
    contents['/f/bad.json'] = '{ not json';
    const base = { ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'qa' };
    expect(() => resolve({ ...base, GOOGLE_SERVICES_JSON: '/f/other.json' })).toThrow(/not the same Firebase project/);
    expect(() => resolve({ ...base, GOOGLE_SERVICES_PLIST: '/f/wrong-bundle.plist' })).toThrow(/BUNDLE_ID/);
    expect(() => resolve({ ...base, GOOGLE_SERVICES_JSON: '/f/wrong-package.json' })).toThrow(/no client for/);
    expect(() => resolve({ ...base, GOOGLE_SERVICES_JSON: '/f/bad.json' })).toThrow(/not valid JSON/);
  });
  test('the expected project is mandatory, so a production build cannot silently take the Dev files', () => {
    const { FIREBASE_EXPECTED_PROJECT_ID, ...withoutPin } = env;
    for (const mode of ['qa', 'production']) {
      expect(() => resolve({ ...withoutPin, EXPO_PUBLIC_ANALYTICS_ENV: mode })).toThrow(/FIREBASE_EXPECTED_PROJECT_ID is not set/);
    }
  });
  test('FIREBASE_EXPECTED_PROJECT_ID pins the project per profile', () => {
    expect(resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'qa', FIREBASE_EXPECTED_PROJECT_ID: 'trackspense-dev' }).enabled).toBe(true);
    expect(() => resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'production', FIREBASE_EXPECTED_PROJECT_ID: 'trackspense-prod' })).toThrow(/trackspense-dev.*trackspense-prod/);
  });
  test('a qa build can never be a release build', () => {
    expect(() => resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'qa', EAS_BUILD_PROFILE: 'production' })).toThrow(/release build/);
    expect(() => resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'qa', TRACKSPENSE_ENABLE_PUSH: '1' })).toThrow(/release build/);
    expect(resolve({ ...env, EXPO_PUBLIC_ANALYTICS_ENV: 'production', EAS_BUILD_PROFILE: 'production' }).enabled).toBe(true);
  });
  test('the Firebase config files are gitignored, so a stray copy cannot be committed', () => {
    const ignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^GoogleService-Info\.plist$/m);
    expect(ignore).toMatch(/^google-services\.json$/m);
  });
  test('the committed repo contains no Firebase config files', () => {
    for (const name of ['GoogleService-Info.plist', 'google-services.json']) expect(fs.existsSync(path.join(__dirname, name))).toBe(false);
  });
});

describe('eas.json build profiles', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(__dirname, 'eas.json'), 'utf8'));
  test('qa reports to the Dev project and production to Prod, each in its own EAS environment', () => {
    expect(eas.build.qa.env.EXPO_PUBLIC_ANALYTICS_ENV).toBe('qa');
    expect(eas.build.production.env.EXPO_PUBLIC_ANALYTICS_ENV).toBe('production');
    expect(eas.build.qa.environment).not.toBe(eas.build.production.environment);
    expect(eas.build.qa.distribution).toBe('internal'); // a qa build is never a store build
  });
  test('no profile carries the e2e variant, a backend override, config files or project ids (those come from EAS environment variables)', () => {
    const text = JSON.stringify(eas);
    for (const forbidden of ['EXPO_PUBLIC_APP_VARIANT', 'e2e', 'EXPO_PUBLIC_API_URL', 'GOOGLE_SERVICES', 'FIREBASE_EXPECTED_PROJECT_ID', 'TRACKSPENSE_ENABLE_PUSH']) {
      expect(text).not.toContain(forbidden);
    }
  });
  test('the profiles agree with the build guards (qa on the production profile name is refused by firebaseConfig)', () => {
    const files = { '/p': '<plist><dict><key>PROJECT_ID</key><string>p</string><key>BUNDLE_ID</key><string>com.cerebroos.trackspense</string></dict></plist>',
      '/j': JSON.stringify({ project_info: { project_id: 'p' }, client: [{ client_info: { android_client_info: { package_name: 'com.cerebroos.trackspense' } } }] }) };
    const base = { GOOGLE_SERVICES_PLIST: '/p', GOOGLE_SERVICES_JSON: '/j', FIREBASE_EXPECTED_PROJECT_ID: 'p' };
    const resolve = (env) => resolveFirebase(env, (f) => f in files, (f) => files[f]);
    expect(resolve({ ...base, ...eas.build.qa.env, EAS_BUILD_PROFILE: 'qa' }).enabled).toBe(true);
    expect(resolve({ ...base, ...eas.build.production.env, EAS_BUILD_PROFILE: 'production' }).enabled).toBe(true);
    expect(() => resolve({ ...base, ...eas.build.qa.env, EAS_BUILD_PROFILE: 'production' })).toThrow(/release build/);
  });
});

describe('scene lifecycle keeps Firebase configured', () => {
  const template = `class AppDelegate: ExpoAppDelegate {
  public override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;
  const firebase = '// @generated begin @react-native-firebase/app-didFinishLaunchingWithOptions - expo prebuild (DO NOT MODIFY) sync-abc\nFirebaseApp.configure()\n// @generated end @react-native-firebase/app-didFinishLaunchingWithOptions\n';
  test('without other plugins the window block is replaced', () => {
    const out = transformAppDelegate(template);
    expect(out).not.toContain('factory.startReactNative(');
    expect(out).toContain('ExpoReactNativeFactoryProvider');
  });
  test('Firebase\'s generated configure() call survives the rewrite', () => {
    const src = template.replace('    window = UIWindow', `${firebase}    window = UIWindow`);
    const out = transformAppDelegate(src);
    expect(out).toContain('FirebaseApp.configure()');
    expect(out).not.toContain('factory.startReactNative(');
    expect(out.indexOf('FirebaseApp.configure()')).toBeLessThan(out.indexOf('return super.application'));
  });
  test('an unexpected template still fails loudly', () => {
    expect(() => transformAppDelegate('class AppDelegate: ExpoAppDelegate {\n factory.startReactNative(x)\n}')).toThrow(/Expo's template changed/);
  });
});
