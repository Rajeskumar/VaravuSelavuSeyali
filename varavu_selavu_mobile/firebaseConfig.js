const fs = require('fs');

/**
 * Decides whether a build carries Firebase and with which config files. Pure so it can be tested.
 *
 * Firebase is native-linked only for an explicit analytics build: EXPO_PUBLIC_ANALYTICS_ENV is `qa` or
 * `production` AND it is not the native E2E variant. Everything else (local development, tests, E2E, an
 * unconfigured EAS profile) gets no Firebase config at all. The config files are never committed; their
 * paths come from the environment (EAS file secrets locally or in CI). Missing files fail the build.
 */
const APP_ID = 'com.cerebroos.trackspense';

function plistValue(text, key) {
  const m = text.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : undefined;
}

function resolveFirebase(env, exists = fs.existsSync, read = (p) => fs.readFileSync(p, 'utf8')) {
  const mode = env.EXPO_PUBLIC_ANALYTICS_ENV;
  if (env.EXPO_PUBLIC_APP_VARIANT === 'e2e' || (mode !== 'qa' && mode !== 'production')) return { enabled: false };
  const plist = env.GOOGLE_SERVICES_PLIST;
  const json = env.GOOGLE_SERVICES_JSON;
  const missing = [];
  if (!plist || !exists(plist)) missing.push('GOOGLE_SERVICES_PLIST (path to GoogleService-Info.plist)');
  if (!json || !exists(json)) missing.push('GOOGLE_SERVICES_JSON (path to google-services.json)');
  if (missing.length) {
    throw new Error(`EXPO_PUBLIC_ANALYTICS_ENV=${mode} needs the Firebase config files for that environment: ${missing.join('; ')}.`);
  }
  // A qa build carries the test-crash control and reports to the Dev project: it must never be a release build.
  if (mode === 'qa' && (env.EAS_BUILD_PROFILE === 'production' || env.TRACKSPENSE_ENABLE_PUSH === '1')) {
    throw new Error('EXPO_PUBLIC_ANALYTICS_ENV=qa cannot be used for a release build (production EAS profile or push-enabled build).');
  }
  // The two platform files must describe the same Firebase project and this app, and match the project this
  // build is meant for. FIREBASE_EXPECTED_PROJECT_ID is required (set it per EAS profile): without it a
  // production build with the Dev files would pass every other check and report to the wrong project.
  const problems = [];
  if (!env.FIREBASE_EXPECTED_PROJECT_ID) problems.push('FIREBASE_EXPECTED_PROJECT_ID is not set (the Firebase project this build must report to)');
  let plistText = '';
  let jsonData = {};
  try { plistText = read(plist); } catch { problems.push('GOOGLE_SERVICES_PLIST could not be read'); }
  try { jsonData = JSON.parse(read(json)); } catch { problems.push('GOOGLE_SERVICES_JSON is not valid JSON'); }
  const plistProject = plistValue(plistText, 'PROJECT_ID');
  const jsonProject = jsonData && jsonData.project_info && jsonData.project_info.project_id;
  const plistBundle = plistValue(plistText, 'BUNDLE_ID');
  const packages = ((jsonData && jsonData.client) || []).map((c) => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name);
  if (!plistProject || !jsonProject || plistProject !== jsonProject) problems.push(`the plist (${plistProject || 'no PROJECT_ID'}) and the JSON (${jsonProject || 'no project_id'}) are not the same Firebase project`);
  if (plistBundle !== APP_ID) problems.push(`the plist BUNDLE_ID is ${plistBundle || 'missing'}, expected ${APP_ID}`);
  if (!packages.includes(APP_ID)) problems.push(`google-services.json has no client for ${APP_ID}`);
  if (env.FIREBASE_EXPECTED_PROJECT_ID && plistProject !== env.FIREBASE_EXPECTED_PROJECT_ID) {
    problems.push(`the config files are for project ${plistProject}, but FIREBASE_EXPECTED_PROJECT_ID is ${env.FIREBASE_EXPECTED_PROJECT_ID}`);
  }
  if (problems.length) throw new Error(`Refusing to build with EXPO_PUBLIC_ANALYTICS_ENV=${mode}: ${problems.join('; ')}.`);
  return { enabled: true, mode, plist, json };
}

/** Applies the result to an Expo config (returns a new object). */
function applyFirebase(config, resolved) {
  if (!resolved.enabled) return config;
  return {
    ...config,
    ios: { ...config.ios, googleServicesFile: resolved.plist },
    android: { ...config.android, googleServicesFile: resolved.json },
    plugins: [...(config.plugins || []), '@react-native-firebase/app', '@react-native-firebase/crashlytics'],
  };
}

module.exports = { resolveFirebase, applyFirebase };
