import { analytics, configureAnalytics } from '../../../core/analytics';
import { createRecordingProvider } from '../../../core/analytics/providers/recording';
import { notifyAuth, registerAuthObserver } from '../../../core/auth/authObserver';
import { RequestError } from '../../../core/api/request';
import { trackAuthEvent } from './auth';
import { eventInvariant, terminalFamily, trackSpenseEvents } from './events';

let provider: ReturnType<typeof createRecordingProvider>;
const sent = () => provider.calls.filter((c) => c.type === 'event').map((c) => {
  const { name, params } = c as { name: string; params: Record<string, string> };
  const { product, platform, feature, app_version, ...rest } = params;
  return { name, ...rest };
});
beforeEach(() => {
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'ios', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
  registerAuthObserver(trackAuthEvent);
});
afterEach(() => registerAuthObserver(null));

test('sign-in, failed sign-in, registration and sign-out map to catalog events with no account data', () => {
  notifyAuth({ type: 'signed_in' });
  notifyAuth({ type: 'sign_in_failed', error: Object.assign(new Error('Login failed: 401 ada@example.test'), { status: 401 }) });
  notifyAuth({ type: 'register_started' });
  notifyAuth({ type: 'registered' });
  notifyAuth({ type: 'register_failed', error: Object.assign(new Error('x'), { status: 429 }) });
  notifyAuth({ type: 'signed_out' });
  expect(sent()).toEqual([
    { name: 'login', authentication_method: 'password' },
    { name: 'login_failed', authentication_method: 'password', outcome: 'failure', error_code: 'unauthorized' },
    { name: 'signup_started', authentication_method: 'password' },
    { name: 'sign_up', authentication_method: 'password' },
    { name: 'signup_failed', authentication_method: 'password', outcome: 'failure', error_code: 'rate_limited' },
    { name: 'logout' },
  ]);
  expect(JSON.stringify(provider.calls)).not.toMatch(/ada@|example/);
});
test('a lost registration reply is unknown, a dropped connection on login is a network failure', () => {
  notifyAuth({ type: 'register_failed', error: new RequestError('lost', true) });
  notifyAuth({ type: 'sign_in_failed', error: new TypeError('Network request failed') });
  expect(sent().map((e) => `${e.name}:${(e as { outcome?: string }).outcome}:${(e as { error_code?: string }).error_code}`)).toEqual([
    'signup_failed:unknown:outcome_unknown', 'login_failed:failure:network',
  ]);
});
test('a throwing observer never reaches core', () => {
  registerAuthObserver(() => { throw new Error('boom'); });
  expect(() => notifyAuth({ type: 'signed_in' })).not.toThrow();
});
test('without consent nothing is sent', () => {
  analytics.setConsent(false);
  notifyAuth({ type: 'signed_in' });
  expect(sent()).toEqual([]);
});
