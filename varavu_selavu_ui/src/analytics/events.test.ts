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
