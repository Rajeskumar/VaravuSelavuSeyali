import { initializeAnalytics, setConsent } from '../analytics/browser';
/** Compatibility surface: existing callers keep their consent key and no-throw functions. */
export type { ConsentChoice } from '../analytics/client';
export { getStoredConsent } from '../analytics/browser';
export function initAnalyticsFromStoredConsent(): void { initializeAnalytics(); }
export function grantAnalyticsConsent(): void { setConsent('granted'); }
export function denyAnalyticsConsent(): void { setConsent('denied'); }
