const { withAndroidManifest, withPodfile } = require('@expo/config-plugins');

/**
 * Privacy-first native defaults for the Firebase SDKs (Analytics + Crashlytics). Generic: nothing here
 * names an app. It applies to EVERY build, including ones without Firebase config, so no binary ever
 * carries advertising-ID access.
 *
 *  - iOS: build FirebaseAnalytics WITHOUT AdSupport (no IDFA, so no App Tracking Transparency prompt).
 *  - Android: remove the advertising-ID and Ad Services permissions that the Firebase/Play Services
 *    libraries merge into the manifest (AD_ID, ACCESS_ADSERVICES_*).
 *  - Collection defaults (off until consent), automatic screen reporting and ad flags are set in
 *    firebase.json, which both platforms read at build time.
 */
const ANDROID_PERMISSIONS_TO_REMOVE = [
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
];
const POD_FLAG = '$RNFirebaseAnalyticsWithoutAdIdSupport = true';
const POD_TAG = '# @generated rnfb-without-adid';

function applyAndroidManifest(manifest) {
  const root = manifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  root['uses-permission'] = root['uses-permission'] || [];
  for (const name of ANDROID_PERMISSIONS_TO_REMOVE) {
    const existing = root['uses-permission'].find((p) => p.$ && p.$['android:name'] === name);
    if (existing) existing.$['tools:node'] = 'remove';
    else root['uses-permission'].push({ $: { 'android:name': name, 'tools:node': 'remove' } });
  }
  return manifest;
}

function applyPodfile(contents) {
  if (contents.includes(POD_FLAG)) return contents;
  return `${POD_TAG}\n${POD_FLAG}\n${contents}`;
}

module.exports = function withFirebasePrivacy(config) {
  config = withAndroidManifest(config, (c) => { c.modResults = applyAndroidManifest(c.modResults); return c; });
  config = withPodfile(config, (c) => { c.modResults.contents = applyPodfile(c.modResults.contents); return c; });
  return config;
};
module.exports.applyAndroidManifest = applyAndroidManifest;
module.exports.applyPodfile = applyPodfile;
module.exports.ANDROID_PERMISSIONS_TO_REMOVE = ANDROID_PERMISSIONS_TO_REMOVE;
