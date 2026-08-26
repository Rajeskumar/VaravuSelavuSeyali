const CONSENT_KEY = 'vs_analytics_consent';
const GA_MEASUREMENT_ID = 'G-0M1N9KSEW5';

export type ConsentChoice = 'granted' | 'denied';

export function getStoredConsent(): ConsentChoice | null {
  const v = localStorage.getItem(CONSENT_KEY);
  return v === 'granted' || v === 'denied' ? v : null;
}

function setStoredConsent(choice: ConsentChoice): void {
  localStorage.setItem(CONSENT_KEY, choice);
}

/** Injects gtag.js and fires the initial pageview. Only ever called after the visitor has
 * actively granted consent (a fresh "Accept" click, or a `granted` choice stored from a prior
 * visit) — never on page load unconditionally. index.html only defines the dataLayer/gtag
 * queue stub; this is what actually turns tracking on. */
function loadGoogleAnalytics(): void {
  if (document.getElementById('ga4-script')) return;
  const script = document.createElement('script');
  script.id = 'ga4-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  const w = window as any;
  w.gtag('js', new Date());
  w.gtag('config', GA_MEASUREMENT_ID);
}

/** Call once on app mount: resumes analytics for a returning visitor who already granted
 * consent on a prior visit, without showing the banner again. */
export function initAnalyticsFromStoredConsent(): void {
  if (getStoredConsent() === 'granted') {
    loadGoogleAnalytics();
  }
}

export function grantAnalyticsConsent(): void {
  setStoredConsent('granted');
  loadGoogleAnalytics();
}

export function denyAnalyticsConsent(): void {
  setStoredConsent('denied');
}
