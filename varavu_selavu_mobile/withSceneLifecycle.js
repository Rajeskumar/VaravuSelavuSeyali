/**
 * Adopts the UIScene life cycle on iOS.
 *
 * Apps built with the iOS 27 SDK (Xcode 27) are killed at launch by UIKit unless they use the
 * scene-based life cycle (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
 * Expo SDK 57 ships `ExpoAppSceneDelegate` for this, but its prebuild template still generates
 * the old window-in-AppDelegate setup. This plugin applies what Expo's SDK 58 template does:
 *
 *  - Info.plist gets a `UIApplicationSceneManifest` whose scene delegate is Expo's own
 *    `ExpoAppSceneDelegate` (Objective-C name `EXExpoAppSceneDelegate`), so no extra Swift file
 *    has to be added to the Xcode project.
 *  - AppDelegate conforms to `ExpoReactNativeFactoryProvider` and stops creating the window and
 *    starting React Native itself; the scene delegate does both when the scene connects.
 *
 * Drop this plugin once the project is on an Expo SDK whose template adopts scenes (SDK 58+).
 */
const { withInfoPlist, withAppDelegate } = require('@expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    };
    return config;
  });
}

/**
 * Pure AppDelegate.swift transform (exported for tests). Other plugins insert generated blocks just above
 * `factory.startReactNative(` (for example @react-native-firebase/app adds `FirebaseApp.configure()`); those
 * run before this one, so they are lifted out, the window/React Native start-up block is removed, and they
 * are put back, otherwise the SDK would never be configured.
 */
function transformAppDelegate(source) {
  let src = source;
  if (!src.includes('ExpoReactNativeFactoryProvider')) {
    const decl = 'class AppDelegate: ExpoAppDelegate';
    if (!src.includes(decl + ' {')) {
      throw new Error(`withSceneLifecycle: couldn't find "${decl} {" in AppDelegate.swift; Expo's template changed`);
    }
    src = src.replace(decl + ' {', decl + ', ExpoReactNativeFactoryProvider {');
  }

  // The template's window creation + startReactNative block. Under the scene life cycle the
  // scene delegate creates the window, so leaving this in would start React Native twice.
  const windowBlock = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
  const generated = /[ \t]*\/\/ @generated begin [^\n]*\n[\s\S]*?\/\/ @generated end [^\n]*\n/g;
  const kept = [];
  const withoutGenerated = src.replace(generated, (block) => { kept.push(block); return ''; });
  if (windowBlock.test(withoutGenerated)) {
    src = withoutGenerated.replace(
      windowBlock,
      '\n' + kept.join('') +
        '    // The window is created and React Native is started by ExpoAppSceneDelegate under the\n' +
        '    // scene-based life cycle (required by the iOS 27 SDK). See withSceneLifecycle.js.\n',
    );
  } else if (src.includes('factory.startReactNative(')) {
    throw new Error("withSceneLifecycle: AppDelegate still starts React Native but the expected block wasn't found; Expo's template changed");
  }
  return src;
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    }
    config.modResults.contents = transformAppDelegate(config.modResults.contents);
    return config;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
module.exports.transformAppDelegate = transformAppDelegate;
