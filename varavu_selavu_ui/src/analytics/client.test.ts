import { createAnalyticsClient } from './client';
import { createRecordingProvider } from './providers/recording';
import { noopProvider } from './providers/types';
const config = { enabled: true, measurementId: 'G-TESTONLY01', origin: 'https://app.example.test' };
function setup(grant = true) {
  const recording = createRecordingProvider();
  const client = createAnalyticsClient(config, recording.provider, 'https://cerebroos.com/product?email=SECRET');
  client.initialize();
  if (grant) client.setConsent('granted');
  return { client, ...recording };
}
test('one page per committed navigation, with revisits and distinct resources but no queries/StrictMode duplicates', () => {
  const { client, events } = setup();
  for (const path of ['/dashboard', '/dashboard', '/expenses', '/expenses?query=SECRET', '/dashboard', '/groups/PRIVATE-A', '/groups/PRIVATE-B', '/dashboard']) {
    client.trackPageView(path, true);
  }
  expect(events).toHaveLength(6);
  expect(events.map(e => e.properties.route_template)).toEqual(['/dashboard', '/expenses', '/dashboard', '/groups/:groupId', '/groups/:groupId', '/dashboard']);
  expect(events[0].properties.page_referrer).toBe('https://cerebroos.com/');
  expect(events[1].properties.page_referrer).toBe(config.origin + '/dashboard');
  expect(events[1].properties.page_title).toBe('Expenses — TrackSpense');
  expect(JSON.stringify(events)).not.toMatch(/SECRET|PRIVATE/);
});
test('redirects and guard destinations only track the final visible page', () => {
  const { client, events } = setup();
  client.trackPageView('/dashboard', false);
  client.trackPageView('/login', false);
  client.trackPageView('/profile', true);
  client.trackPageView('/account', true);
  client.trackPageView('/', true);
  expect(events.map(e => e.properties.route_template)).toEqual(['/login', '/account']);
});
test('grant tracks current page once, with no replay of denied history', () => {
  const { client, events } = setup(false);
  const deniedOperation = client.beginOperation();
  client.trackPageView('/dashboard', true);
  client.trackPageView('/expenses', true);
  client.setConsent('granted'); client.setConsent('granted');
  expect(events).toHaveLength(1);
  expect(events[0].properties.route_template).toBe('/expenses');
  expect(client.track('expense_created', { entry_method: 'manual', expense_scope: 'personal' }, deniedOperation)).toBe(false);
});
test.each(['revoke', 'reset', 'disable', 'sensitive'])('%s prevents stale callbacks and reinitialization in a loaded document', action => {
  const { client, events } = setup(); client.trackPageView('/expenses', true);
  const op = client.beginOperation();
  if (action === 'revoke') client.setConsent('denied');
  if (action === 'reset') client.resetIdentity();
  if (action === 'disable') client.disable();
  if (action === 'sensitive') client.prepareNavigation('/ai/approve/SECRET', true);
  client.setConsent('granted'); client.initialize(); client.trackPageView('/expenses', true);
  expect(client.track('expense_created', { entry_method: 'manual', expense_scope: 'personal' }, op)).toBe(false);
  expect(events).toHaveLength(1);
});
test('success and failure share an operation terminal; start can precede it', () => {
  const { client, events } = setup(); client.trackPageView('/expenses', true);
  const op = client.beginOperation();
  expect(client.track('expense_creation_started', { entry_method: 'manual', expense_scope: 'personal' }, op)).toBe(true);
  expect(client.track('expense_created', { entry_method: 'manual', expense_scope: 'personal' }, op)).toBe(true);
  expect(client.track('expense_created', { entry_method: 'manual', expense_scope: 'personal' }, op)).toBe(false);
  expect(client.track('expense_creation_failed', { entry_method: 'manual', expense_scope: 'personal', outcome: 'failure', error_code: 'server' }, op)).toBe(false);
  expect(events).toHaveLength(3);
});
test('unsafe properties, unknown events and all account identifiers are rejected or ignored', () => {
  const { client, events } = setup(); client.trackPageView('/dashboard', true);
  client.identify('private@example.test');
  expect(client.track('group_created', { email: 'private@example.test' } as any)).toBe(false);
  expect(client.track('made_up' as any, {})).toBe(false);
  expect(events).toHaveLength(1);
});
test('dedup state is bounded and expires, and provider exceptions do not escape', () => {
  let now = 0;
  const { provider } = createRecordingProvider();
  const client = createAnalyticsClient(config, provider, '', () => now);
  client.initialize(); client.setConsent('granted'); client.trackPageView('/groups', true);
  const old = client.beginOperation();
  for (let i = 0; i < 1000; i++) client.beginOperation();
  expect(client.track('group_created', {}, old)).toBe(false);
  const expired = client.beginOperation(); now += 30 * 60_000;
  expect(client.track('group_created', {}, expired)).toBe(false);
  const broken = createAnalyticsClient(config, { ...noopProvider, initialize() { throw new Error('blocked'); } });
  expect(() => { broken.initialize(); broken.setConsent('granted'); broken.trackPageView('/groups', true); broken.resetIdentity(); }).not.toThrow();
});
test('disabled environment never invokes its provider even with consent', () => {
  const initialize = jest.fn();
  const client = createAnalyticsClient({ ...config, enabled: false }, { ...noopProvider, initialize });
  client.initialize(); client.setConsent('granted'); client.trackPageView('/', false);
  expect(initialize).not.toHaveBeenCalled();
});
