import { configureAnalytics, analytics } from '../../../core/analytics';
import { createRecordingProvider } from '../../../core/analytics/providers/recording';
import { RequestError } from '../../../core/api/request';
import { eventInvariant, terminalFamily, trackSpenseEvents } from './events';
import { categoryDisposition, confirmed, durationBucket, expenseCreation, observe, safeFailure, terminal } from './operations';

let provider: ReturnType<typeof createRecordingProvider>;
const sent = () => provider.calls.filter((c) => c.type === 'event').map((c) => {
  const e = c as { name: string; params: Record<string, string> };
  const { product, platform, feature, app_version, ...rest } = e.params;
  return { name: e.name, ...rest };
});
beforeEach(() => {
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'ios', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
});

describe('safeFailure', () => {
  test('maps status and type, never message text', () => {
    expect(safeFailure(new RequestError('secret@example.test', false, 422))).toEqual({ outcome: 'failure', error_code: 'validation' });
    expect(safeFailure(new RequestError('x', false, 401))).toEqual({ outcome: 'failure', error_code: 'unauthorized' });
    expect(safeFailure(new RequestError('x', false, 403))).toEqual({ outcome: 'failure', error_code: 'forbidden' });
    expect(safeFailure(new RequestError('x', false, 409), true)).toEqual({ outcome: 'failure', error_code: 'conflict' });
    expect(safeFailure(new RequestError('x', false, 429), true)).toEqual({ outcome: 'failure', error_code: 'rate_limited' });
    expect(safeFailure(new RequestError('x', false, 503))).toEqual({ outcome: 'failure', error_code: 'server' });
    expect(safeFailure(new RequestError('offline'))).toEqual({ outcome: 'failure', error_code: 'network' });
    expect(safeFailure(new TypeError('Network request failed'))).toEqual({ outcome: 'failure', error_code: 'network' });
  });
  test('a write the client could not confirm is unknown, not failed', () => {
    expect(safeFailure(new RequestError('lost', true), true)).toEqual({ outcome: 'unknown', error_code: 'outcome_unknown' });
    expect(safeFailure(new RequestError('5xx', true, 502), true)).toEqual({ outcome: 'unknown', error_code: 'outcome_unknown' });
    expect(safeFailure(new Error('weird'), true)).toEqual({ outcome: 'unknown', error_code: 'unknown' });
    // groups' ApiError carries a status without being a RequestError
    expect(safeFailure(Object.assign(new Error('x'), { status: 409 }), true)).toEqual({ outcome: 'failure', error_code: 'conflict' });
  });
  test('cancellation is its own outcome', () => {
    expect(safeFailure(new Error('x'), false, true)).toEqual({ outcome: 'cancelled', error_code: 'cancelled' });
  });
});

describe('observe / confirmed', () => {
  test('analytics failures never replace the result or the error', async () => {
    await expect(observe(async () => 7, () => { throw new Error('emit'); })).resolves.toBe(7);
    const boom = new Error('app');
    await expect(observe(async () => { throw boom; }, () => {}, () => { throw new Error('emit'); })).rejects.toBe(boom);
  });
  test('confirmed emits once, only after success and only when accepted', async () => {
    await confirmed(async () => ({ ok: false }), 'group_created', {}, (r) => r.ok);
    expect(sent()).toEqual([]);
    await confirmed(async () => ({ ok: true }), 'group_created', {}, (r) => r.ok);
    expect(sent()).toEqual([{ name: 'group_created' }]);
    await expect(confirmed(async () => { throw new Error('nope'); }, 'group_created', {})).rejects.toThrow('nope');
    expect(sent()).toHaveLength(1);
  });
  test('terminal emits success or one failure, never both', async () => {
    const failure = { name: 'login_failed' as const, properties: (f: ReturnType<typeof safeFailure>) => ({ authentication_method: 'password' as const, ...f }) };
    await terminal(async () => 1, { name: 'login', properties: { authentication_method: 'password' } }, failure, false);
    await expect(terminal(async () => { throw new RequestError('x', false, 401); }, { name: 'login', properties: { authentication_method: 'password' } }, failure, false)).rejects.toThrow();
    expect(sent()).toEqual([
      { name: 'login', authentication_method: 'password' },
      { name: 'login_failed', authentication_method: 'password', outcome: 'failure', error_code: 'unauthorized' },
    ]);
  });
});

describe('expenseCreation', () => {
  const props = { entry_method: 'manual', expense_scope: 'personal' };
  test('no capture context means no events', async () => {
    await expenseCreation(async () => 1, undefined, 'personal');
    expect(sent()).toEqual([]);
  });
  test('personal and group success use their own events once', async () => {
    await expenseCreation(async () => 1, { method: 'manual' }, 'personal');
    await expenseCreation(async () => 1, { method: 'receipt' }, 'group');
    expect(sent()).toEqual([
      { name: 'expense_created', ...props },
      { name: 'group_expense_created', entry_method: 'receipt', expense_scope: 'group' },
    ]);
  });
  test('a rejected save is a failure; a lost reply is unknown; neither is a success', async () => {
    await expect(expenseCreation(async () => { throw new RequestError('x', false, 409); }, { method: 'manual' }, 'personal')).rejects.toThrow();
    await expect(expenseCreation(async () => { throw new RequestError('lost', true); }, { method: 'quick_log' }, 'personal')).rejects.toThrow();
    expect(sent()).toEqual([
      { name: 'expense_creation_failed', ...props, outcome: 'failure', error_code: 'conflict' },
      { name: 'expense_creation_failed', entry_method: 'quick_log', expense_scope: 'personal', outcome: 'unknown', error_code: 'outcome_unknown' },
    ]);
  });
  test('an unconfirmed response is unknown, not created', async () => {
    await expenseCreation(async () => ({ success: false }), { method: 'manual' }, 'personal', (r) => r.success);
    expect(sent().map((e) => e.name)).toEqual(['expense_creation_failed']);
  });
  test('suggestion disposition rides on the confirmed save, once', async () => {
    await expenseCreation(async () => 1, { method: 'manual', categoryDisposition: 'overridden' }, 'personal');
    expect(sent().map((e) => e.name)).toEqual(['expense_created', 'category_suggestion_overridden']);
  });
  test('a transport retry that reuses the operation counts once', async () => {
    const operation = analytics.beginOperation();
    await expenseCreation(async () => 1, { method: 'manual', operation }, 'personal');
    await expenseCreation(async () => 1, { method: 'manual', operation }, 'personal');
    expect(sent().filter((e) => e.name === 'expense_created')).toHaveLength(1);
  });
  test('without consent nothing is sent and the save still succeeds', async () => {
    analytics.setConsent(false);
    await expect(expenseCreation(async () => 'saved', { method: 'manual' }, 'personal')).resolves.toBe('saved');
    expect(sent()).toEqual([]);
  });
});

test('suggestion disposition and duration buckets', () => {
  expect(categoryDisposition(undefined, 'Food')).toBeUndefined();
  expect(categoryDisposition('Food', 'Food')).toBe('accepted');
  expect(categoryDisposition('Food', 'Travel')).toBe('overridden');
  expect([999, 1000, 4999, 5000, 14999, 15000, 59999, 60000].map(durationBucket))
    .toEqual(['under_1s', '1_to_5s', '1_to_5s', '5_to_15s', '5_to_15s', '15_to_60s', '15_to_60s', 'over_60s']);
});
