import { createAnalyticsClient, ConsentChoice, Operation } from './client';
import { resolveConfig } from './config';
import { createGa4Provider } from './providers/ga4';
import { noopProvider } from './providers/types';
import { isTrackable, routeForPath } from './routes';
export const CONSENT_KEY = 'vs_analytics_consent';
export const CONSENT_CHANGED = 'vs_analytics_consent_changed';
export const PREFERENCES_OPEN = 'vs_analytics_preferences_open';
let volatileDenial = false;
export function getStoredConsent(): ConsentChoice | null {
  if (volatileDenial) return 'denied';
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch { return null; }
}
const config = resolveConfig({
  NODE_ENV: process.env.NODE_ENV,
  REACT_APP_ANALYTICS_ENV: process.env.REACT_APP_ANALYTICS_ENV,
  REACT_APP_ANALYTICS_ENABLED: process.env.REACT_APP_ANALYTICS_ENABLED,
  REACT_APP_ANALYTICS_CONFIG_VERIFIED: process.env.REACT_APP_ANALYTICS_CONFIG_VERIFIED,
  REACT_APP_GA4_MEASUREMENT_ID: process.env.REACT_APP_GA4_MEASUREMENT_ID,
  REACT_APP_VERSION: process.env.REACT_APP_VERSION,
}, window.location.origin);
export const analytics = createAnalyticsClient(config,
  config.enabled ? createGa4Provider(window, document) : noopProvider, document.referrer);
let pendingInvite: Operation | undefined;
export function deferInviteOutcome(operation: Operation) { pendingInvite = operation; }
export function finishInviteOutcome(pathname: string) {
  const route = routeForPath(pathname);
  if (route.excluded || route.redirect || !pendingInvite) return;
  const operation = pendingInvite;
  pendingInvite = undefined;
  if (route.id === 'group_detail') analytics.track('group_invitation_accepted', {}, operation);
}
let installed = false;
const identity = () => { try { return localStorage.getItem('vs_user'); } catch { return null; } };
const reloadIfStarted = () => { if (analytics.hasStarted()) window.location.reload(); };
export function setConsent(choice: ConsentChoice): boolean {
  try {
    // Denial acts synchronously even if persisting the choice fails.
    if (choice === 'denied') { volatileDenial = true; analytics.setConsent('denied'); }
    const wasDenied = getStoredConsent() === 'denied';
    let stored = false;
    try { localStorage.setItem(CONSENT_KEY, choice); stored = true; } catch {
      // Remove a stale stored grant if possible. Never reload into it after a failed write.
      volatileDenial = true; analytics.setConsent('denied');
      try { localStorage.removeItem(CONSENT_KEY); } catch { /* session remains sealed */ }
    }
    if (choice === 'granted' && stored) { volatileDenial = false; analytics.setConsent('granted'); }
    window.dispatchEvent(new Event(CONSENT_CHANGED));
    if (stored && (choice === 'denied' || wasDenied)) reloadIfStarted();
    return stored;
  } catch { return false; /* Never interrupt a business operation. */ }
}
export function openAnalyticsPreferences() { window.dispatchEvent(new Event(PREFERENCES_OPEN)); }

/** Installed before React and before any Google SDK. Browser hooks only exist if collection
 * is explicitly configured; default-off development/tests do not alter browser history. */
export function initializeAnalytics() {
  if (installed) return;
  installed = true;
  analytics.initialize();
  analytics.setConsent(getStoredConsent());
  let previousIdentity = identity();
  const onIdentity = () => {
    const next = identity();
    if (previousIdentity && previousIdentity !== next) {
      analytics.resetIdentity(); reloadIfStarted();
    }
    previousIdentity = next;
  };
  window.addEventListener('vs_auth_changed', onIdentity);
  window.addEventListener('storage', event => {
    if (event.key === CONSENT_KEY || event.key === null) {
      volatileDenial = false;
      const choice = getStoredConsent();
      analytics.setConsent(choice);
      window.dispatchEvent(new Event(CONSENT_CHANGED));
      if (choice !== 'granted') reloadIfStarted();
    }
    if (event.key === 'vs_user' || event.key === null) onIdentity();
  });
  if (!config.enabled) return;
  const prepare = (path: string) => {
    const trackable = isTrackable(routeForPath(path), !!identity());
    analytics.prepareNavigation(path, !!identity());
    return analytics.hasStarted() && !trackable;
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      if (url != null) {
        const target = new URL(String(url), window.location.href);
        // Preserve the native same-origin security check, never navigate externally here.
        if (target.origin === window.location.origin && prepare(target.pathname)) {
          if (method === 'replaceState') window.location.replace(target.href);
          else window.location.assign(target.href);
          return;
        }
      }
      original(data, unused, url);
    };
  }
  window.addEventListener('popstate', () => {
    if (prepare(window.location.pathname)) window.location.reload();
  }, true);
  // Pages restored from bfcache must re-evaluate persisted consent/identity before use.
  window.addEventListener('pageshow', event => {
    if (event.persisted && analytics.hasStarted()) { analytics.disable(); window.location.reload(); }
  });
}
