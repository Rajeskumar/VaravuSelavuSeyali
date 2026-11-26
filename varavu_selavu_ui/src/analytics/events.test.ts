import { readFileSync } from 'fs';
import { resolve } from 'path';
import { events, validateEvent } from './events';

test.each(Object.keys(events))('%s accepts exactly its declared schema and rejects extra financial data', name => {
  const schema = events[name as keyof typeof events].properties;
  const props = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== 'duration_bucket').map(([key, values]) => [key, values[0]]));
  expect(validateEvent(name, props)).toEqual(props);
  for (const key of ['email', 'amount', 'description', 'merchant', 'receipt', 'group_id', 'members', 'expense_id', 'spreadsheet_id', 'prompt', 'error', 'page_location', 'user_id']) {
    expect(validateEvent(name, { ...props, [key]: 'PRIVATE' })).toBeNull();
  }
});
test('unknown names, enums, nested values, symbols, getters and missing required properties reject entire events', () => {
  expect(validateEvent('constructor', {})).toBeNull();
  expect(validateEvent('first_expense_created', {})).toBeNull();
  expect(validateEvent('login', {})).toBeNull();
  expect(validateEvent('login', { authentication_method: 'email@example.test' })).toBeNull();
  expect(validateEvent('login', { authentication_method: { password: 'secret' } })).toBeNull();
  const getter = jest.fn(() => 'password');
  expect(validateEvent('login', Object.defineProperty({}, 'authentication_method', { get: getter }))).toBeNull();
  expect(getter).not.toHaveBeenCalled();
  expect(validateEvent('logout', { [Symbol('hidden')]: 'secret' })).toBeNull();
  expect(validateEvent('logout', new Proxy({}, { ownKeys() { throw Error('bad'); } }))).toBeNull();
});
test('unknown writes and cancellation have consistent outcomes', () => {
  const base = { entry_method: 'manual', expense_scope: 'personal' };
  expect(validateEvent('expense_creation_failed', { ...base, outcome: 'failure', error_code: 'outcome_unknown' })).toBeNull();
  expect(validateEvent('expense_creation_failed', { ...base, outcome: 'unknown', error_code: 'outcome_unknown' })).not.toBeNull();
  expect(validateEvent('ai_query_failed', { outcome: 'failure', error_code: 'cancelled' })).toBeNull();
});

// Shared contract: docs/analytics/catalog.v1.json is the source of truth for event names, features and
// closed property values on every platform. Web must carry exactly the events marked `web`.
describe('shared analytics catalog', () => {
  const catalog = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/analytics/catalog.v1.json'), 'utf8'));
  const web = Object.entries(catalog.events as Record<string, { feature: string; platforms: string[];
    properties: Record<string, { values: string[]; optional: boolean }> }>).filter(([, e]) => e.platforms.includes('web'));

  test('web declares exactly the catalog events marked for web', () => {
    expect(Object.keys(events).sort()).toEqual(web.map(([name]) => name).sort());
  });
  test.each(web)('%s matches the catalog feature and property values', (name, expected) => {
    const actual = events[name as keyof typeof events];
    expect(actual.feature).toBe(expected.feature);
    const declared = Object.fromEntries(Object.entries(actual.properties).map(([key, values]) => [key, [...values]]));
    const wanted = Object.fromEntries(Object.entries(expected.properties).map(([key, p]) => [key, p.values]));
    expect(declared).toEqual(wanted);
    for (const [key, p] of Object.entries(expected.properties)) expect(p.optional).toBe(key === 'duration_bucket');
  });
  test('catalog features and platforms are closed values', () => {
    expect(catalog.context.platform).toEqual(['web', 'ios', 'android']);
    for (const [, e] of Object.entries(catalog.events as Record<string, { feature: string }>)) expect(catalog.features).toContain(e.feature);
  });
});
