import { createGa4Provider } from './ga4';
const config = { enabled: true, measurementId: 'G-TESTONLY01', origin: 'https://app.example.test' };
const page = { page_location: config.origin + '/groups/:groupId', page_title: 'Groups — TrackSpense', page_referrer: '', route_template: '/groups/:groupId', route_id: 'group_detail' };
function commands() { return ((window as any).tsAnalyticsLayer as IArguments[]).map(args => Array.from(args)); }
afterEach(() => { document.getElementById('ga4-script')?.remove(); });
test('uses one private queue, safe context before configuration, manual views and disabled advertising', () => {
  const provider = createGa4Provider(window, document);
  provider.initialize(config, page); provider.initialize(config, page);
  const calls = commands();
  expect(calls.map(c => c[0])).toEqual(['consent', 'set', 'js', 'config']);
  expect(calls[1][1]).toMatchObject({ ...page, send_page_view: false });
  expect(calls[3][2]).toMatchObject({ ...page, send_page_view: false, cookie_domain: 'none', cookie_prefix: 'tsga', allow_google_signals: false, allow_ad_personalization_signals: false });
  expect(calls[3][2]).not.toHaveProperty('debug_mode');
  expect(document.querySelectorAll('#ga4-script')).toHaveLength(1);
  expect(document.getElementById('ga4-script')?.getAttribute('src')).toContain('l=tsAnalyticsLayer');
  provider.track('login', { authentication_method: 'password' });
  expect(commands().slice(-1)[0]).toEqual(['event', 'login', { method: 'password', send_to: config.measurementId }]);
});
test('revocation purges queued work and cannot restart listeners in the same document', () => {
  const provider = createGa4Provider(window, document);
  provider.initialize(config, page); provider.track('page_view', { ...page });
  provider.resetIdentity(); provider.track('logout', {}); provider.initialize(config, page);
  expect(commands()).toEqual([]);
  expect((window as any)[`ga-disable-${config.measurementId}`]).toBe(true);
  expect(document.getElementById('ga4-script')).toBeNull();
});
test('script failure disables collection without throwing', () => {
  const provider = createGa4Provider(window, document); provider.initialize(config, page);
  expect(() => document.getElementById('ga4-script')?.dispatchEvent(new Event('error'))).not.toThrow();
  expect((window as any)[`ga-disable-${config.measurementId}`]).toBe(true);
  expect(commands()).toEqual([]);
});

test('staging explicitly marks each emitted event for DebugView', () => {
  const provider = createGa4Provider(window, document);
  provider.initialize({ ...config, debug: true }, page);
  provider.track('page_view', { ...page });
  expect(commands().slice(-1)[0]).toEqual([
    'event', 'page_view', { ...page, send_to: config.measurementId, debug_mode: true },
  ]);
});
