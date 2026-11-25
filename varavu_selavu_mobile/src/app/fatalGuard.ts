import { crashReporter } from '../core/analytics';
import { installFatalErrorSanitizer } from '../core/analytics/crash';

/**
 * Imported first by index.js, before App and its screens load, so an error thrown while the app's modules are
 * initialising already reaches React Native's handler sanitized in release builds. setupAnalytics() installs the
 * sanitizer again after the Crashlytics SDK has installed its own handler, so that one is outermost.
 */
installFatalErrorSanitizer((globalThis as { ErrorUtils?: never }).ErrorUtils, () => !__DEV__ || crashReporter.isEnabled());
