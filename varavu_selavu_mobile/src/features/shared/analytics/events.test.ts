import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createAnalyticsClient } from '../../../core/analytics/client';
import { createRecordingProvider } from '../../../core/analytics/providers/recording';
import { validateEvent } from '../../../core/analytics/validate';
import { eventInvariant, terminalFamily, trackSpenseEvents } from './events';

type Catalog = { context: { platform: string[] }; features: string[]; events: Record<string, {
  feature: string; platforms: string[]; properties: Record<string, { values: string[]; optional: boolean }> }> };
const catalog: Catalog = JSON.parse(readFileSync(resolve(__dirname, '../../../../../docs/analytics/catalog.v1.json'), 'utf8'));
const mobile = Object.entries(catalog.events).filter(([, e]) => e.platforms.includes('ios') || e.platforms.includes('android'));

describe('shared analytics catalog (docs/analytics/catalog.v1.json)', () => {
  test('iOS and Android carry the same events, so one table serves both', () => {
    for (const [name, e] of Object.entries(catalog.events)) {
      expect(e.platforms.includes('ios')).toBe(e.platforms.includes('android'));
      expect(name).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    }
  });
  test('mobile declares exactly the catalog events marked for mobile', () => {
    expect(Object.keys(trackSpenseEvents).sort()).toEqual(mobile.map(([name]) => name).sort());
  });
  test.each(mobile)('%s matches the catalog feature, values and optionality', (name, expected) => {
    const actual = trackSpenseEvents[name as keyof typeof trackSpenseEvents] as unknown as
      { feature: string; properties: Record<string, { values: string[]; optional?: boolean }> };
    expect(actual.feature).toBe(expected.feature);
    expect(catalog.features).toContain(expected.feature);
    expect(Object.keys(actual.properties).sort()).toEqual(Object.keys(expected.properties).sort());
    for (const [key, p] of Object.entries(expected.properties)) {
      expect(actual.properties[key].values).toEqual(p.values);
      expect(!!actual.properties[key].optional).toBe(p.optional);
    }
  });
  test('Firebase limits: names ≤ 40 chars, ≤ 25 params, values ≤ 100 chars', () => {
    for (const [name, e] of mobile) {
      expect(name.length).toBeLessThanOrEqual(40);
      expect(Object.keys(e.properties).length + 5).toBeLessThanOrEqual(25); // + product, platform, feature, app_version
      for (const p of Object.values(e.properties)) for (const v of p.values) expect(v.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('TrackSpense events through the generic validator', () => {
  const table = trackSpenseEvents as never;
  test.each(Object.keys(trackSpenseEvents).filter((n) => n !== 'screen_view'))('%s accepts its schema and rejects extra private data', (name) => {
    const schema = (trackSpenseEvents as Record<string, { properties: Record<string, { values: readonly string[]; optional?: boolean }> }>)[name].properties;
    const props = Object.fromEntries(Object.entries(schema).filter(([, p]) => !p.optional).map(([k, p]) => [k, p.values[0]]));
    const ok = { ...props };
    // the first enum value of a failure event must still satisfy the app invariant
    const accepted = validateEvent(table, name, ok);
    expect(accepted).toEqual(ok);
    for (const key of ['email', 'amount', 'description', 'merchant', 'receipt', 'group_id', 'members', 'expense_id', 'prompt', 'error', 'user_id', 'token', 'screen_name_free']) {
      expect(validateEvent(table, name, { ...ok, [key]: 'PRIVATE' })).toBeNull();
    }
  });
  test('failure outcomes must be consistent', () => {
    const base = { entry_method: 'manual', expense_scope: 'personal' };
    const v = (p: Record<string, string>) => validateEvent(table, 'expense_creation_failed', { ...base, ...p }, (r) => eventInvariant('expense_creation_failed', r));
    expect(v({ outcome: 'failure', error_code: 'outcome_unknown' })).toBeNull();
    expect(v({ outcome: 'unknown', error_code: 'outcome_unknown' })).not.toBeNull();
    expect(v({ outcome: 'cancelled', error_code: 'network' })).toBeNull();
  });
  test('screen names are limited to the registered stable ids', () => {
    expect(validateEvent(table, 'screen_view', { screen_name: 'group_detail' })).not.toBeNull();
    expect(validateEvent(table, 'screen_view', { screen_name: 'GroupDetail' })).toBeNull();
    expect(validateEvent(table, 'screen_view', { screen_name: 'Group 7f3a1c' })).toBeNull();
  });
});

describe('terminal families', () => {
  test('creation, sign-up, login and suggestion outcomes each collapse to one per operation', () => {
    const provider = createRecordingProvider();
    const client = createAnalyticsClient({ provider, events: trackSpenseEvents as never, platform: 'ios', product: 'trackspense', terminalFamily, invariant: eventInvariant });
    client.setConsent(true);
    const op = client.beginOperation();
    expect(client.track('expense_creation_failed', { entry_method: 'manual', expense_scope: 'personal', outcome: 'unknown', error_code: 'outcome_unknown' }, op)).toBe(true);
    expect(client.track('expense_created', { entry_method: 'manual', expense_scope: 'personal' }, op)).toBe(false);
    const login = client.beginOperation();
    expect(client.track('login', { authentication_method: 'password' }, login)).toBe(true);
    expect(client.track('login_failed', { authentication_method: 'password', outcome: 'failure', error_code: 'server' }, login)).toBe(false);
    expect(terminalFamily('receipt_parse_completed')).toBe(terminalFamily('receipt_parse_failed'));
    expect(terminalFamily('ai_query_started')).not.toBe(terminalFamily('ai_query_completed'));
  });
});
