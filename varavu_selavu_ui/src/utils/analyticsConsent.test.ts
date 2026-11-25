import { denyAnalyticsConsent, getStoredConsent, grantAnalyticsConsent, initAnalyticsFromStoredConsent } from './analyticsConsent';

beforeEach(() => {
  localStorage.clear();
  document.getElementById('ga4-script')?.remove();
  (window as any).gtag = jest.fn();
});

test('a grant in automated tests never loads the production tag', () => {
  grantAnalyticsConsent();
  initAnalyticsFromStoredConsent();
  expect(document.getElementById('ga4-script')).toBeNull();
  expect((window as any).gtag).not.toHaveBeenCalled();
});

test('unavailable preference storage fails closed instead of crashing the app', () => {
  const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  try {
    expect(() => initAnalyticsFromStoredConsent()).not.toThrow();
    expect(getStoredConsent()).toBeNull();
  } finally { spy.mockRestore(); }
});

test('withdrawal remains usable when storage is blocked', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  try { expect(() => denyAnalyticsConsent()).not.toThrow(); }
  finally { spy.mockRestore(); }
});

test('a failed withdrawal write removes a stale stored grant when possible', () => {
  localStorage.setItem('vs_analytics_consent', 'granted');
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  try {
    denyAnalyticsConsent();
    expect(localStorage.getItem('vs_analytics_consent')).toBeNull();
    expect(getStoredConsent()).toBe('denied');
  } finally { spy.mockRestore(); }
});
