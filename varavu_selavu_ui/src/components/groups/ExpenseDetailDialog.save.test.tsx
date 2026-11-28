import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpenseDetailDialog from './ExpenseDetailDialog';
import * as api from '../../api/groups';

// TS-FIX-103: payers and split are sent only when the user changed them, so the server keeps the stored
// split (rescaled for a new amount) instead of every edit being saved as the exact pre-fill.
jest.mock('../../hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('../expenses/CategoryPickerField', () => () => null);

const NOTE = 'The saved split and payments will adjust to the new total unless you change them.';
const members: any = [
  { member_id: 'me', display_name: 'Ada', role: 'admin', status: 'active' },
  { member_id: 'bob', display_name: 'Bob', role: 'member', status: 'active' },
];
const expense: any = {
  row_id: 'e1', description: 'Dinner', cost: 30, category: 'Dining out', date: '11/20/2026', split_type: 'equal',
  payer_summary: [{ member_id: 'me', amount_paid: 30 }],
  splits: [{ member_id: 'me', share: 15 }, { member_id: 'bob', share: 15 }],
};

let update: jest.SpyInstance;
beforeEach(() => {
  jest.spyOn(api, 'listExpenseComments').mockResolvedValue([] as any);
  jest.spyOn(api, 'getExpenseHistory').mockResolvedValue([] as any);
  update = jest.spyOn(api, 'updateGroupExpense').mockResolvedValue({ row_id: 'e1' } as any);
});
afterEach(() => jest.restoreAllMocks());

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExpenseDetailDialog open initialMode="edit" onClose={jest.fn()} groupId="g1" expense={expense}
        members={members} myMemberId="me" onSettled={jest.fn()} onDeleted={jest.fn()} onUpdated={jest.fn()} setToast={jest.fn()} />
    </QueryClientProvider>,
  );
const save = async () => {
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(update).toHaveBeenCalled());
  return update.mock.calls[0][2];
};

test('an amount change saves without redoing the split, and says the split will adjust', async () => {
  open();
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '41' } });
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  const body = await save();
  expect(body.amount).toBe(41);
  expect(body).not.toHaveProperty('payers');
  expect(body).not.toHaveProperty('split');
});

test('a description-only edit leaves the stored equal split alone', async () => {
  open();
  fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), { target: { value: 'Supper' } });
  const body = await save();
  expect(body.description).toBe('Supper');
  expect(body).not.toHaveProperty('split');
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
});
