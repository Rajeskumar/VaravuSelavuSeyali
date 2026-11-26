import { getAppConfig } from '../config/appConfig';

/** One place for the wording shown in the prompt and the Privacy screen. */
export function consentCopy() {
  const brand = getAppConfig().brand.name;
  return {
    analyticsTitle: 'Usage analytics',
    analyticsBody:
      `Share which screens and features are used and whether actions worked, so ${brand} can be improved. ` +
      'Never includes amounts, descriptions, names, emails, receipts or chat messages. Processed by Google (Firebase).',
    crashTitle: 'Crash reports',
    crashBody:
      'Send crash and error reports (device model, OS and app version, and what failed) so problems can be fixed. ' +
      'Never includes your expense data. Processed by Google (Firebase Crashlytics).',
    identifiers:
      "Google may also receive a device identifier and approximate location (from your IP address). This isn't linked to your account, so it can't be deleted for one account; it expires with its retention period.",
    footer: 'These choices apply to this device and you can change them any time in Account → Privacy.',
  };
}
