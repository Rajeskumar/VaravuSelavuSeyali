import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogExpense } from './useLogExpense';
import { createGroupExpenseWithItems, getGroup } from '../api/groups';
import { addExpenseWithItems } from '../api/expenses';

jest.mock('../api/groups', () => ({
  createGroupExpense: jest.fn(),
  createGroupExpenseWithItems: jest.fn(),
  getGroup: jest.fn(),
}));
jest.mock('../api/expenses', () => ({ addExpense: jest.fn(), addExpenseWithItems: jest.fn() }));
jest.mock('../api/tags', () => ({ applyTagsToExpense: jest.fn() }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const lines = [
  { line_no: 1, item_name: 'Milk', line_total: 8, original_price: 10 },
  { line_no: 2, item_name: 'Bread', line_total: 4 },
];

beforeEach(() => {
  localStorage.setItem('vs_user', 'me@test.com');
  (getGroup as jest.Mock).mockResolvedValue({
    members: [{ member_id: 'm1', user_email: 'me@test.com' }, { member_id: 'm2', user_email: 'b@test.com' }],
  });
  (createGroupExpenseWithItems as jest.Mock).mockResolvedValue({ row_id: 'r1', my_share: 7 });
  (addExpenseWithItems as jest.Mock).mockResolvedValue({ expense_id: 'e1' });
});

// TS-FIX-102 (S-21)
it('saves a group receipt split on its total with tax and tip, and no item assignment', async () => {
  const { result } = renderHook(() => useLogExpense(), { wrapper });
  await result.current.logToGroupWithItems('g1', {
    description: 'Costco', category: 'Groceries', amount: 14, date: '2026-11-20', items: lines, tax: 0.5, tip: 1.5,
    split: { type: 'shares', entries: [{ member_id: 'm1', value: 2 }, { member_id: 'm2', value: 1 }] },
  });
  const payload = (createGroupExpenseWithItems as jest.Mock).mock.calls[0][1];
  expect(payload.split).toEqual({ type: 'shares', entries: [{ member_id: 'm1', value: 2 }, { member_id: 'm2', value: 1 }] });
  expect(payload).toMatchObject({ tax: 0.5, tip: 1.5 });
  expect(payload.items[0]).toEqual(expect.objectContaining({ line_total: 8, discount: 2, original_price: 10 }));
  for (const item of payload.items) {
    expect(item).not.toHaveProperty('member_ratios');
    expect(item).not.toHaveProperty('tax');
  }
});

it('defaults a group receipt to an equal split across everyone', async () => {
  const { result } = renderHook(() => useLogExpense(), { wrapper });
  await result.current.logToGroupWithItems('g1', { description: 'x', category: 'Groceries', amount: 12, items: lines });
  expect((createGroupExpenseWithItems as jest.Mock).mock.calls[0][1].split).toEqual({
    type: 'equal', entries: [{ member_id: 'm1' }, { member_id: 'm2' }],
  });
});

it('keeps the scanned tip on a personal receipt and sends no header discount', async () => {
  const { result } = renderHook(() => useLogExpense(), { wrapper });
  await result.current.logPersonalWithItems({ description: 'Dinner', category: 'Dining out', amount: 15.5, items: lines, tax: 2, tip: 1.5 });
  const { header, items } = (addExpenseWithItems as jest.Mock).mock.calls[0][0];
  expect(header).toMatchObject({ tax: 2, tip: 1.5 });
  expect(header).not.toHaveProperty('discount');
  expect(items[0]).toEqual(expect.objectContaining({ line_total: 8, discount: 2 }));
});
