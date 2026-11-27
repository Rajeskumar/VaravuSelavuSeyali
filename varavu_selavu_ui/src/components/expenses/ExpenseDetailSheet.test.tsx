import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import { getGroup, getGroupExpenseItems, updateGroupExpenseItems } from '../../api/groups';
import type { FeedExpense } from './ExpenseFeed';

jest.mock('../../api/groups', () => ({
  getGroup: jest.fn(),
  getGroupExpenseItems: jest.fn(),
  updateGroupExpenseItems: jest.fn(),
}));
jest.mock('../../api/expenses', () => ({ getExpenseItems: jest.fn(), updateExpenseItems: jest.fn() }));
jest.mock('../../hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));

const receipt: FeedExpense = {
  key: 'group-r1', kind: 'group', id: 'r1', groupId: 'g1', date: '11/20/2026', description: 'Dinner',
  category: 'Dining out', mainCategory: 'Food & Drink', amount: 50, groupAmount: 100, splitType: 'itemized',
} as FeedExpense;

const mount = (onSave = jest.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExpenseDetailSheet expense={receipt} open onClose={() => {}} onSave={onSave} onDelete={() => {}} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  (getGroupExpenseItems as jest.Mock).mockResolvedValue({
    items: [{ id: 'i1', line_no: 1, item_name: 'Steak', line_total: 68, discount: 2, original_price: 70 },
            { id: 'i2', line_no: 2, item_name: 'Wine', line_total: 30, discount: 0, original_price: 30 }],
    amount: 98, tax: 0, tip: 0, discount: 0, legacy_discount_format: true,
  });
  (getGroup as jest.Mock).mockResolvedValue({
    members: [{ member_id: 'm1', display_name: 'Me' }, { member_id: 'm2', display_name: 'Bo' }],
  });
});

// TS-FIX-102 (S-23)
it('flags an old-format receipt and blocks Save until the items match the amount', async () => {
  mount();
  expect(await screen.findByRole('note')).toHaveTextContent('Prices were adjusted for discounts');
  // The sheet opened with the stored 100.00 but the converted lines come to 98.00.
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '98.00' } });
  expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled();
});

it('asks how to split the new total when the server needs it, then sends the split', async () => {
  (updateGroupExpenseItems as jest.Mock)
    .mockRejectedValueOnce(Object.assign(new Error('The receipt amount changed. Choose how to split it: Equal, Exact or Shares.'),
      { detail: { code: 'split_required' } }))
    .mockResolvedValueOnce({});
  const onSave = jest.fn();
  mount(onSave);
  await screen.findByRole('note');
  fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '98.00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose how to split it');
  expect(await screen.findByText('Split the new total')).toBeInTheDocument();
  // Split types offered for a receipt: Equal, Exact, Shares only.
  expect(screen.getByText('Shares')).toBeInTheDocument();
  expect(screen.getByText('Exact')).toBeInTheDocument();
  expect(screen.queryByText('Percentage')).not.toBeInTheDocument();
  expect(screen.queryByText('Adjustment')).not.toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  const payload = (updateGroupExpenseItems as jest.Mock).mock.calls[1][2];
  expect(payload.split).toEqual({ type: 'equal', entries: [{ member_id: 'm1' }, { member_id: 'm2' }] });
  expect(payload.items[0]).toEqual(expect.objectContaining({ id: 'i1', line_total: 68, discount: 2 }));
});
