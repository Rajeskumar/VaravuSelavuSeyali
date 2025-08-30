import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExpensesPage from './ExpensesPage';
import * as api from '../api/expenses';
import React from 'react';

jest.mock('heic2any', () => ({
  default: jest.fn(),
}), { virtual: true });

beforeEach(() => {
  localStorage.setItem('vs_user', 'user');
});

afterEach(() => {
  localStorage.clear();
});

test('shows expenses and opens form', async () => {
  jest.spyOn(api, 'listExpenses').mockResolvedValue([
    { row_id: 1, user_id: 'user', date: '2024-01-01', description: 'Coffee', category: 'Food & Drink', cost: 3 },
  ]);
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ExpensesPage />
    </QueryClientProvider>
  );
  await waitFor(() => screen.getByText('Coffee'));
  expect(screen.getByText('Coffee')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
  expect(await screen.findByText(/Add New Expense/i)).toBeInTheDocument();
});
