import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpenseDetailDialog from './ExpenseDetailDialog';
import * as api from '../../api/groups';

// TS-FIX-104: a refused second payment left the old balance on screen, inviting the person to pay it again.
jest.mock('../../hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('../expenses/CategoryPickerField', () => () => null);

const members: any = [
  { member_id: 'me', display_name: 'Ada', role: 'admin', status: 'active' },
  { member_id: 'bob', display_name: 'Bob', role: 'member', status: 'active' },
];
const expense: any = {
  row_id: 'e1', description: 'Dinner', cost: 30, my_share: 15, category: 'Dining out', date: '11/20/2026', split_type: 'equal',
  payer_summary: [{ member_id: 'bob', amount_paid: 30 }],
  splits: [{ member_id: 'me', share: 15 }, { member_id: 'bob', share: 15 }],
};

beforeEach(() => {
  jest.spyOn(api, 'listExpenseComments').mockResolvedValue([] as any);
  jest.spyOn(api, 'getExpenseHistory').mockResolvedValue([] as any);
});
afterEach(() => jest.restoreAllMocks());

async function settleAndFail(error: Error) {
  jest.spyOn(api, 'settleExpenseShare').mockRejectedValue(error);
  const onSettled = jest.fn();
  const setToast = jest.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExpenseDetailDialog open onClose={jest.fn()} groupId="g1" expense={expense} members={members}
        myMemberId="me" onSettled={onSettled} onDeleted={jest.fn()} onUpdated={jest.fn()} setToast={setToast} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Settle my .*15\.00 share/ }));
  await waitFor(() => expect(setToast).toHaveBeenCalled());
  return { onSettled, toast: setToast.mock.calls[0][0] };
}

test('a share that was already settled says so and refreshes the balances', async () => {
  const { onSettled, toast } = await settleAndFail(new api.ApiError('This share has already been settled', 409, null));
  expect(toast.message).toBe('This share has already been settled');
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test('any other refusal keeps the expense open', async () => {
  const { onSettled } = await settleAndFail(new api.ApiError('Expense has no payers', 400, null));
  expect(onSettled).not.toHaveBeenCalled();
});
