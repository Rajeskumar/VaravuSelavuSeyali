import { analytics } from './browser';
import { addExpense, addExpenseWithItems } from '../api/expenses';
import { createGroupExpense } from '../api/groups';
import { executeRecurringNow } from '../api/recurring';
import { login, register } from '../api/auth';
import { fetchWithAuth } from '../api/api';
import { RequestError } from '../api/request';

jest.mock('../api/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('./browser', () => ({ analytics: {
  beginOperation: () => ({ generation: 0, token: {} }),
  track: jest.fn(),
} }));

const track = analytics.track as jest.Mock;
const request = fetchWithAuth as jest.Mock;
const payload = { user_id: 'private@example.test', description: 'PRIVATE', date: '01/01/2026', category: 'General', cost: 12 };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => jest.clearAllMocks());

test('personal expense counts only after confirmation and analytics never receives the expense', async () => {
  let reply!: (value: unknown) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  const pending = addExpense(payload, { method: 'manual', categoryDisposition: 'accepted' });
  expect(track).not.toHaveBeenCalled();
  reply(response({ success: true, expense: { ...payload, row_id: 99 } }));
  await pending;
  expect(track.mock.calls.map(([name, props]) => [name, props])).toEqual([
    ['expense_created', { entry_method: 'manual', expense_scope: 'personal' }],
    ['category_suggestion_accepted', {}],
  ]);
});

test('a lost write response is an unknown outcome and does not resend the write', async () => {
  const error = new RequestError('PRIVATE', true);
  request.mockRejectedValueOnce(error);
  await expect(addExpense(payload, { method: 'quick_log' })).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('expense_creation_failed', {
    entry_method: 'quick_log', expense_scope: 'personal', outcome: 'unknown', error_code: 'outcome_unknown',
  }, expect.anything());
});

test('receipt conflicts and unsuccessful envelopes never produce create events', async () => {
  request.mockResolvedValueOnce(response({ detail: 'PRIVATE' }, 409)).mockResolvedValueOnce(response({ success: false }));
  await expect(addExpenseWithItems({}, { method: 'receipt' })).rejects.toThrow();
  await addExpense(payload, { method: 'manual' });
  expect(track.mock.calls.map(([name, props]) => [name, props.error_code])).toEqual([
    ['expense_creation_failed', 'conflict'], ['expense_creation_failed', 'outcome_unknown'],
  ]);
});

test('group and receipt creates emit one canonical event each, and context-free API calls emit none', async () => {
  request.mockResolvedValueOnce(response({ success: true, expense: { row_id: 'PRIVATE' } }))
    .mockResolvedValueOnce(response({ expense_id: 1 })).mockResolvedValueOnce(response({ success: true, expense: payload }));
  await createGroupExpense('PRIVATE', {} as Parameters<typeof createGroupExpense>[1], { method: 'receipt' });
  await addExpenseWithItems({}, { method: 'receipt' });
  await addExpense(payload);
  expect(track.mock.calls.map(([name, props]) => [name, props])).toEqual([
    ['group_expense_created', { entry_method: 'receipt', expense_scope: 'group' }],
    ['expense_created', { entry_method: 'receipt', expense_scope: 'personal' }],
  ]);
});

test('successful registration is counted independently of a failed auto-login', async () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ success: true }) as Response)
    .mockResolvedValueOnce(response({}, 401) as Response);
  try {
    await register({ name: 'PRIVATE', email: 'private@example.test', password: 'PRIVATE' });
    await expect(login({ username: 'private@example.test', password: 'PRIVATE' })).rejects.toThrow();
    expect(track.mock.calls.map(([name, props]) => [name, props])).toEqual([
      ['sign_up', { authentication_method: 'password' }],
      ['login_failed', { authentication_method: 'password', outcome: 'failure', error_code: 'unauthorized' }],
    ]);
  } finally { fetchSpy.mockRestore(); }
});

test('recurring run reports only a newly confirmed execution', async () => {
  request.mockResolvedValueOnce(response({ success: true, already_added: true }))
    .mockResolvedValueOnce(response({ success: true, created: true }));
  await executeRecurringNow('PRIVATE');
  expect(track).not.toHaveBeenCalled();
  await executeRecurringNow('PRIVATE');
  expect(track).toHaveBeenCalledWith('recurring_run_completed', { action: 'executed' }, expect.anything());
});
