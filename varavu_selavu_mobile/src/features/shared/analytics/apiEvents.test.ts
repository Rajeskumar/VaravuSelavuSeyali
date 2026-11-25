jest.mock('../../../core/api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../featureFlags', () => ({ getConfig: jest.fn(async () => ({})) }));
jest.mock('../../ask/utils/aiConsent', () => ({
  ensureAiConsent: jest.fn(async () => true),
  hasAiConsent: jest.fn(async () => true),
  AiConsentDeclined: class AiConsentDeclined extends Error { constructor() { super('declined'); this.name = 'AiConsentDeclined'; } },
}));

import { apiFetch } from '../../../core/api/apiFetch';
import { RequestError } from '../../../core/api/request';
import { analytics, configureAnalytics } from '../../../core/analytics';
import { createRecordingProvider } from '../../../core/analytics/providers/recording';
import { addExpense, addExpenseWithItems, categorizeExpense, deleteExpense, parseReceiptOcr, updateExpense, uploadReceipt } from '../../expenses/api/expenses';
import { safeFailure } from './operations';
import { sendChatMessageFull } from '../../ask/api/chat';
import { ensureAiConsent } from '../../ask/utils/aiConsent';
import { confirmRecurring, deleteRecurringTemplate, executeRecurringNow, upsertRecurringTemplate } from '../../recurring/api/recurring';
import { acceptInvite, addGroupExpense, createGroup, createInvite, deleteGroupExpense, recordSettlement, settleExpenseShare, updateGroupExpense } from '../../groups/api/groups';
import { eventInvariant, terminalFamily, trackSpenseEvents } from './events';

const fetchMock = apiFetch as jest.Mock;
const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body });
const bad = (status: number, body: unknown = { detail: 'PRIVATE merchant name' }) => ({ ok: false, status, statusText: 'x', json: async () => body });
let provider: ReturnType<typeof createRecordingProvider>;
const sent = () => provider.calls.filter((c) => c.type === 'event').map((c) => {
  const { name, params } = c as { name: string; params: Record<string, string> };
  const { product, platform, feature, app_version, ...rest } = params;
  return { name, ...rest };
});
const payload = { description: 'Lunch at Joe', category: 'Food', date: '01/01/2026', cost: 12.5 } as never;

beforeEach(() => {
  fetchMock.mockReset();
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'android', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
});

describe('personal expenses', () => {
  test('a confirmed create reports once with the entry method and nothing else', async () => {
    fetchMock.mockResolvedValue(ok());
    await addExpense(payload, 't', { method: 'quick_log' });
    expect(sent()).toEqual([{ name: 'expense_created', entry_method: 'quick_log', expense_scope: 'personal' }]);
    expect(JSON.stringify(provider.calls)).not.toMatch(/Joe|12\.5|Lunch|Food/);
  });
  test('without capture context a save reports nothing', async () => {
    fetchMock.mockResolvedValue(ok());
    await addExpense(payload, 't');
    expect(sent()).toEqual([]);
  });
  test('a 4xx is a failure with a static code and the caller still gets the original error', async () => {
    fetchMock.mockResolvedValue(bad(422));
    await expect(addExpense(payload, 't', { method: 'manual' })).rejects.toThrow('Failed to add expense');
    expect(sent()).toEqual([{ name: 'expense_creation_failed', entry_method: 'manual', expense_scope: 'personal', outcome: 'failure', error_code: 'validation' }]);
  });
  test('a lost reply is unknown, with no success and no automatic retry', async () => {
    fetchMock.mockRejectedValue(new RequestError('Connection lost.', true));
    await expect(addExpense(payload, 't', { method: 'manual' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual([{ name: 'expense_creation_failed', entry_method: 'manual', expense_scope: 'personal', outcome: 'unknown', error_code: 'outcome_unknown' }]);
  });
  test('itemized (receipt) creation counts only with an expense id', async () => {
    fetchMock.mockResolvedValueOnce(ok({ expense_id: 'abc', item_ids: [] }));
    await addExpenseWithItems({ user_email: 'x', header: {}, items: [] }, { method: 'receipt', categoryDisposition: 'accepted' });
    fetchMock.mockResolvedValueOnce(ok({}));
    await addExpenseWithItems({ user_email: 'x', header: {}, items: [] }, { method: 'receipt' });
    expect(sent().map((e) => e.name)).toEqual(['expense_created', 'category_suggestion_accepted', 'expense_creation_failed']);
  });
  test('update and delete report only after the server confirms', async () => {
    fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(bad(500)).mockResolvedValueOnce(ok()).mockResolvedValueOnce(bad(404));
    await updateExpense(1, payload, 't');
    await expect(updateExpense(1, payload, 't')).rejects.toThrow();
    await deleteExpense(1, 't');
    await expect(deleteExpense(1, 't')).rejects.toThrow();
    expect(sent()).toEqual([{ name: 'expense_updated', expense_scope: 'personal' }, { name: 'expense_deleted', expense_scope: 'personal' }]);
  });
});

describe('receipt and suggestion failures keep their status, so the funnel can count them', () => {
  const caught = async (run: () => Promise<unknown>) => { try { await run(); } catch (e) { return e; } throw new Error('expected a rejection'); };
  test('4xx and 5xx classify from the status; the message is unchanged', async () => {
    fetchMock.mockResolvedValue(bad(422));
    const ocr = await caught(() => parseReceiptOcr({} as never));
    expect((ocr as Error).message).toBe('Failed to parse receipt');
    expect(safeFailure(ocr)).toEqual({ outcome: 'failure', error_code: 'validation' });
    fetchMock.mockResolvedValue(bad(500));
    expect(safeFailure(await caught(() => categorizeExpense('lunch')))).toEqual({ outcome: 'failure', error_code: 'server' });
    expect(safeFailure(await caught(() => uploadReceipt('file://x', 't')))).toEqual({ outcome: 'failure', error_code: 'server' });
  });
  test('an AI quota refusal is reported as quota', async () => {
    fetchMock.mockResolvedValue(bad(429, { detail: { code: 'daily_limit', message: 'x' } }));
    const err = await caught(() => uploadReceipt('file://x', 't'));
    expect(safeFailure(err)).toEqual({ outcome: 'failure', error_code: 'quota' });
  });
  test('a dropped connection is a network failure', () => {
    expect(safeFailure(new RequestError('Cannot reach the server'))).toEqual({ outcome: 'failure', error_code: 'network' });
  });
});

describe('Ask (AI Analyst)', () => {
  const payload = { user_id: 'u', messages: [{ role: 'user', content: 'How much did I spend at Joe\'s Pizza?' }] } as never;
  test('a delivered answer reports a start and one completion, never the question or answer', async () => {
    fetchMock.mockResolvedValue(ok({ response: 'You spent $52.10 at Joe\'s' }));
    await sendChatMessageFull('t', payload);
    expect(sent().map((e) => e.name)).toEqual(['ai_query_started', 'ai_query_completed']);
    expect(JSON.stringify(provider.calls)).not.toMatch(/Joe|52\.10|spent/);
  });
  test('a server error and a quota refusal are separate failure codes', async () => {
    fetchMock.mockResolvedValueOnce(bad(500, { detail: 'boom' })).mockResolvedValueOnce(bad(429, { detail: { code: 'daily_limit', message: 'limit' } }));
    await expect(sendChatMessageFull('t', payload)).rejects.toThrow();
    await expect(sendChatMessageFull('t', payload)).rejects.toThrow();
    const failed = sent().filter((e) => e.name === 'ai_query_failed') as unknown as { error_code: string; outcome: string }[];
    expect(failed.map((f) => f.error_code)).toEqual(['server', 'quota']);
  });
  test('declining the AI prompt sends nothing: no question left the device', async () => {
    (ensureAiConsent as jest.Mock).mockResolvedValueOnce(false);
    await expect(sendChatMessageFull('t', payload)).rejects.toThrow('declined');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent()).toEqual([]);
  });
});

describe('recurring', () => {
  const tpl = { description: 'Rent', category: 'Home', day_of_month: 1, default_cost: 1200 } as never;
  test('save, pause, resume and delete each report their own action after the server accepts', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await upsertRecurringTemplate(tpl);
    await upsertRecurringTemplate(tpl, 'paused');
    await upsertRecurringTemplate(tpl, 'resumed');
    await deleteRecurringTemplate('id-1');
    expect(sent().map((e) => (e as { action?: string }).action)).toEqual(['saved', 'paused', 'resumed', 'deleted']);
    expect(JSON.stringify(provider.calls)).not.toMatch(/Rent|1200|id-1/);
  });
  test('a rejected save reports nothing', async () => {
    fetchMock.mockResolvedValue(bad(500));
    await expect(upsertRecurringTemplate(tpl)).rejects.toThrow();
    expect(sent()).toEqual([]);
  });
  test('run-now counts only a row that was actually created', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, created: true }))
      .mockResolvedValueOnce(ok({ success: true, created: false, already_added: true }))
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(ok({ success: false, error: 'nope' }));
    for (let i = 0; i < 4; i++) await executeRecurringNow('t');
    expect(sent()).toEqual([{ name: 'recurring_run_completed', action: 'executed' }]);
  });
  test('confirming due items is one acknowledged command, with no count or ids', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true })).mockResolvedValueOnce(ok({ success: false }));
    await confirmRecurring([{ template_id: 'tpl-9', date_iso: '2026-11-01', cost: 9 }]);
    await confirmRecurring([{ template_id: 'tpl-9', date_iso: '2026-11-01', cost: 9 }]);
    expect(sent()).toEqual([{ name: 'recurring_run_completed', action: 'confirmed' }]);
    expect(JSON.stringify(provider.calls)).not.toMatch(/tpl-9|2026/);
  });
});

describe('groups and settlements', () => {
  test('group create, expense, update, delete, invite, accept and settle each report once, with no ids', async () => {
    fetchMock.mockResolvedValue(ok({ expense: { id: 'e1' }, group_id: 'SECRET-GROUP', token: 'SECRET-TOKEN' }));
    await createGroup({ name: 'Trip to Goa', group_type: 'trip' } as never);
    await addGroupExpense('SECRET-GROUP', {} as never, { method: 'manual' });
    await updateGroupExpense('SECRET-GROUP', 'e1', {} as never);
    await deleteGroupExpense('SECRET-GROUP', 'e1');
    await createInvite('SECRET-GROUP', 'm1', 'friend@example.test');
    await acceptInvite('SECRET-TOKEN');
    await recordSettlement('SECRET-GROUP', {} as never);
    await settleExpenseShare('SECRET-GROUP', 'e1', { member_id: 'm1' });
    expect(sent().map((e) => e.name)).toEqual([
      'group_created', 'group_expense_created', 'group_expense_updated', 'expense_deleted',
      'group_member_invited', 'group_invitation_accepted', 'settlement_completed', 'settlement_completed',
    ]);
    expect(JSON.stringify(provider.calls)).not.toMatch(/SECRET|Goa|friend@|example/);
  });
  test('an expired invite, a conflicting settlement or a server error is never a success', async () => {
    fetchMock.mockResolvedValue(bad(410));
    await expect(acceptInvite('t')).rejects.toThrow();
    await expect(recordSettlement('g', {} as never)).rejects.toThrow();
    fetchMock.mockResolvedValue(bad(500));
    await expect(createGroup({ name: 'x' } as never)).rejects.toThrow();
    expect(sent()).toEqual([]);
  });
  test('a failed group create is classified from the ApiError status', async () => {
    fetchMock.mockResolvedValue(bad(409));
    await expect(addGroupExpense('g', {} as never, { method: 'manual' })).rejects.toThrow();
    expect(sent()).toEqual([{ name: 'expense_creation_failed', entry_method: 'manual', expense_scope: 'group', outcome: 'failure', error_code: 'conflict' }]);
  });
  test('consent withdrawn mid-flight: the save succeeds and nothing is sent', async () => {
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { release = r; }));
    const pending = addExpense(payload, 't', { method: 'manual' });
    analytics.setConsent(false);
    release(ok());
    await expect(pending).resolves.toBeUndefined();
    expect(sent()).toEqual([]);
  });
});
