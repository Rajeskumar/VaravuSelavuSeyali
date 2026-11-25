import { createAnalyticsClient } from './client';
import { createRecordingProvider } from './providers/recording';
import { validateEvent } from './validate';
import { EventTable } from './types';

// A neutral table: core must work with any app's catalog, not TrackSpense's.
const table: EventTable = {
  screen_view: { feature: 'navigation', properties: { screen_name: { values: ['home', 'settings'] } } },
  thing_done: { feature: 'things', properties: { kind: { values: ['a', 'b'] }, duration_bucket: { values: ['fast', 'slow'], optional: true } } },
  thing_failed: { feature: 'things', properties: { kind: { values: ['a', 'b'] } } },
  thing_ping: { feature: 'things', properties: {} },
};
const family = (name: string) => (name === 'thing_done' || name === 'thing_failed' ? 'thing-terminal' : name);

function setup(overrides: Record<string, unknown> = {}) {
  const provider = createRecordingProvider();
  let now = 1_000;
  const client = createAnalyticsClient({
    provider, events: table, platform: 'ios', product: 'demo', appVersion: '1.2.3',
    terminalFamily: family, now: () => now, ...overrides,
  });
  return { provider, client, advance: (ms: number) => { now += ms; } };
}

describe('validateEvent', () => {
  test('accepts exactly the declared schema and optional properties', () => {
    expect(validateEvent(table, 'thing_done', { kind: 'a' })).toEqual({ kind: 'a' });
    expect(validateEvent(table, 'thing_done', { kind: 'a', duration_bucket: 'fast' })).toEqual({ kind: 'a', duration_bucket: 'fast' });
    expect(validateEvent(table, 'thing_ping', {})).toEqual({});
  });
  test('rejects whole events for unknown names, keys, values, nesting, getters, symbols and proxies', () => {
    const getter = jest.fn(() => 'a');
    const bad: [string, unknown][] = [
      ['constructor', {}], ['nope', {}], ['thing_done', {}], ['thing_done', { kind: 'c' }],
      ['thing_done', { kind: 'a', email: 'a@b.test' }], ['thing_done', { kind: { x: 1 } }],
      ['thing_done', { kind: 'a'.repeat(500) }], ['thing_done', Object.defineProperty({}, 'kind', { get: getter })],
      ['thing_ping', { [Symbol('x')]: 'y' }], ['thing_ping', new Proxy({}, { ownKeys() { throw Error('boom'); } })],
      ['thing_ping', null], ['thing_ping', []], ['thing_ping', 'x'],
    ];
    for (const [name, value] of bad) expect(validateEvent(table, name, value)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
  test('an app invariant can reject otherwise valid combinations', () => {
    const reject = (r: Record<string, string>) => r.kind !== 'b';
    expect(validateEvent(table, 'thing_done', { kind: 'b' }, reject)).toBeNull();
    expect(validateEvent(table, 'thing_done', { kind: 'a' }, reject)).toEqual({ kind: 'a' });
  });
});

describe('start-up reconcile', () => {
  test('the first answer, even a denial, is pushed to the provider once; repeats do nothing', () => {
    const { client, provider } = setup();
    client.setConsent(false);
    client.setConsent(false);
    expect(provider.calls).toEqual([{ type: 'collection', enabled: false }]);
    client.setConsent(true);
    client.setConsent(true);
    expect(provider.calls).toEqual([{ type: 'collection', enabled: false }, { type: 'collection', enabled: true }]);
  });
});

describe('consent gate', () => {
  test('nothing is sent before a grant, and the provider stays disabled', () => {
    const { client, provider } = setup();
    expect(client.track('thing_ping', {})).toBe(false);
    expect(client.trackScreen('home')).toBe(false);
    expect(provider.calls).toEqual([]);
  });
  test('grant enables collection, then events carry only approved context', () => {
    const { client, provider } = setup();
    client.setConsent(true);
    expect(client.track('thing_done', { kind: 'a' })).toBe(true);
    expect(provider.calls).toEqual([
      { type: 'collection', enabled: true },
      { type: 'event', name: 'thing_done', params: { kind: 'a', product: 'demo', platform: 'ios', feature: 'things', app_version: '1.2.3' } },
    ]);
  });
  test('events begun before the grant are never replayed after it', () => {
    const { client, provider } = setup();
    const early = client.beginOperation();
    client.setConsent(true);
    expect(client.track('thing_done', { kind: 'a' }, early)).toBe(false);
    expect(provider.calls.filter((c) => c.type === 'event')).toEqual([]);
  });
  test('revocation stops collection, resets identity and invalidates in-flight operations', () => {
    const { client, provider } = setup();
    client.setConsent(true);
    const op = client.beginOperation();
    client.setConsent(false);
    expect(client.track('thing_done', { kind: 'a' }, op)).toBe(false);
    expect(client.track('thing_ping', {})).toBe(false);
    expect(provider.calls.slice(-2)).toEqual([{ type: 'collection', enabled: false }, { type: 'reset' }]);
    client.setConsent(true);
    expect(client.track('thing_done', { kind: 'a' }, op)).toBe(false); // old generation stays dead
  });
});

describe('operations', () => {
  test('one terminal event per operation, even across success and failure variants', () => {
    const { client, provider } = setup();
    client.setConsent(true);
    const op = client.beginOperation();
    expect(client.track('thing_done', { kind: 'a' }, op)).toBe(true);
    expect(client.track('thing_done', { kind: 'a' }, op)).toBe(false);
    expect(client.track('thing_failed', { kind: 'a' }, op)).toBe(false);
    expect(provider.calls.filter((c) => c.type === 'event')).toHaveLength(1);
  });
  test('operation tokens expire after 30 minutes and the store is bounded', () => {
    const { client, advance } = setup();
    client.setConsent(true);
    const old = client.beginOperation();
    advance(30 * 60_000);
    expect(client.track('thing_ping', {}, old)).toBe(false);
    const first = client.beginOperation();
    for (let i = 0; i < 1000; i++) client.beginOperation();
    expect(client.track('thing_ping', {}, first)).toBe(false);
  });
  test('identity reset invalidates operations from the previous account', () => {
    const { client, provider } = setup();
    client.setConsent(true);
    const op = client.beginOperation();
    client.resetIdentity();
    expect(client.track('thing_done', { kind: 'a' }, op)).toBe(false);
    expect(provider.calls.filter((c) => c.type === 'reset')).toHaveLength(1);
    expect(client.track('thing_ping', {})).toBe(true); // collection itself stays on for the next account
  });
});

describe('screens', () => {
  test('one event per change, none for repeats, a revisit after another screen counts', () => {
    const { client, provider } = setup();
    client.setConsent(true);
    expect(client.trackScreen('home')).toBe(true);
    expect(client.trackScreen('home')).toBe(false);
    expect(client.trackScreen('settings')).toBe(true);
    expect(client.trackScreen('home')).toBe(true);
    expect(provider.calls.filter((c) => c.type === 'screen').map((c) => (c as { name: string }).name)).toEqual(['home', 'settings', 'home']);
  });
  test('unregistered screen names are dropped, never sent', () => {
    const { client, provider } = setup();
    client.setConsent(true);
    expect(client.trackScreen('Group 7f3a-uuid')).toBe(false);
    expect(client.trackScreen(undefined as unknown as string)).toBe(false);
    expect(provider.calls.filter((c) => c.type === 'screen')).toEqual([]);
  });
  test('identity reset lets the same screen be reported again', () => {
    const { client } = setup();
    client.setConsent(true);
    client.trackScreen('home');
    client.resetIdentity();
    expect(client.trackScreen('home')).toBe(true);
  });
});

describe('failure isolation', () => {
  test('a throwing or rejecting provider never reaches the caller', async () => {
    const boom = () => { throw new Error('sdk down'); };
    const reject = () => Promise.reject(new Error('sdk async down'));
    const provider = { setCollectionEnabled: boom, logEvent: boom, logScreen: reject, resetIdentity: reject };
    const client = createAnalyticsClient({ provider, events: table, platform: 'android', product: 'demo' });
    expect(() => client.setConsent(true)).not.toThrow();
    expect(() => client.track('thing_ping', {})).not.toThrow();
    expect(() => client.trackScreen('home')).not.toThrow();
    expect(() => client.resetIdentity()).not.toThrow();
    expect(() => client.setConsent(false)).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
  test('no provider means a harmless disabled client', () => {
    const client = createAnalyticsClient({ provider: undefined, events: table, platform: 'ios', product: 'demo' });
    client.setConsent(true);
    expect(client.track('thing_ping', {})).toBe(false);
  });
});
