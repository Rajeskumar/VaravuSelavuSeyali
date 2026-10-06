import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ExpensesPage from './ExpensesPage';
import { QuickCaptureProvider } from '../context/QuickCaptureContext';
import * as api from '../api/expenses';
import * as groupsApi from '../api/groups';
import * as configApi from '../api/config';
import React from 'react';

jest.mock('heic2any', () => ({
  default: jest.fn(),
}), { virtual: true });

beforeEach(() => {
  localStorage.setItem('vs_user', 'user');
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <QuickCaptureProvider>
          <ExpensesPage />
        </QuickCaptureProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

test('shows expenses and opens Quick Capture', async () => {
  jest.spyOn(api, 'listExpenses').mockResolvedValue({
    items: [
      { row_id: 1, user_id: 'user', date: '01/01/2024', description: 'Coffee', category: 'Food & Drink', cost: 3 },
    ],
    next_offset: undefined,
  });
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
  renderPage();
  await screen.findByText('Coffee');
  expect(screen.getByText('Coffee')).toBeInTheDocument();
  // TrackSpense v3 Prototype: the page's "Add Expense" button now opens the shared
  // QuickCaptureSheet instead of AddExpenseForm's dialog (AddExpenseForm is still used, but only
  // reachable via a row's Edit icon now — see the "opens the full edit form" test below).
  fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
  expect(await screen.findByText('New expense')).toBeInTheDocument();
});

test('deletes an expense', async () => {
  const listSpy = jest.spyOn(api, 'listExpenses').mockResolvedValue({
    items: [
      { row_id: 1, user_id: 'user', date: '01/01/2024', description: 'Coffee', category: 'Food & Drink', cost: 3 },
    ],
    next_offset: undefined,
  });
  const delSpy = jest.spyOn(api, 'deleteExpense').mockResolvedValue();
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
  renderPage();
  await screen.findByText('Coffee');
  // The feed row's delete affordance opens the existing confirm dialog rather
  // than deleting immediately (same two-step flow the old <Table> row already
  // had — `setPendingDelete`/`setConfirmOpen`, confirmed by the delete button
  // handler in ExpensesPage.tsx). Click the row's delete icon, then confirm.
  fireEvent.click(screen.getByLabelText('delete'));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(delSpy).toHaveBeenCalledWith(1));
  listSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// TS-GRP-108: Personal/Groups/Combined scope filter + group badge column
// ---------------------------------------------------------------------------

test('regression: with groups disabled (404), no scope filter renders and personal list is unaffected', async () => {
  jest.spyOn(api, 'listExpenses').mockResolvedValue({
    items: [
      { row_id: 1, user_id: 'user', date: '01/01/2024', description: 'Coffee', category: 'Food & Drink', cost: 3 },
    ],
    next_offset: undefined,
  });
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
  renderPage();
  await screen.findByText('Coffee');
  expect(screen.queryByRole('button', { name: 'Groups' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Combined' })).not.toBeInTheDocument();
});

test('scope filter switches the queried data and shows the group badge column', async () => {
  jest.spyOn(api, 'listExpenses').mockResolvedValue({
    items: [
      { row_id: 1, user_id: 'user', date: '01/01/2024', description: 'Coffee', category: 'Food & Drink', cost: 3 },
    ],
    next_offset: undefined,
  });
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: true, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
  jest.spyOn(groupsApi, 'listGroups').mockResolvedValue([
    { group_id: 'g1', name: 'Apartment 4B', group_type: 'home', currency: 'USD', member_count: 2, my_balance: 0, status: 'active', archived_at: null, deleted_at: null },
  ]);
  // ExpensesPage calls the composed listAllMyGroupExpenses() (which internally
  // calls listGroups/listGroupExpenses as local, un-mockable intra-module refs),
  // so the composed function itself is what needs mocking here.
  const groupExpensesSpy = jest.spyOn(groupsApi, 'listAllMyGroupExpenses').mockResolvedValue([
    {
      row_id: 'ge1',
      date: '01/15/2024',
      description: 'Dinner',
      category: 'Food & Drink',
      cost: 90,
      my_share: 45,
      payer_summary: [],
      splits: [],
      group_id: 'g1',
      group_name: 'Apartment 4B',
    },
  ]);

  renderPage();
  await screen.findByText('Coffee');

  const groupsToggle = await screen.findByRole('button', { name: 'Groups' });
  fireEvent.click(groupsToggle);

  await waitFor(() => expect(groupExpensesSpy).toHaveBeenCalled());
  expect(await screen.findByText('Dinner')).toBeInTheDocument();
  expect(screen.getByText('Apartment 4B')).toBeInTheDocument(); // group caption in place of category
  // $45.00 (my share) now appears twice — the day-group's sticky subtotal
  // header and the row's primary tabular amount — so assert count instead of
  // a single match (TS-DES-102's day-grouped feed structure).
  expect(screen.getAllByText('$45.00').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText(/\$90\.00 total/)).toBeInTheDocument(); // full/group amount, secondary caption
  // Personal-only table (with its Merchant column) is not shown in this scope.
  expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// LR-05: the CSV button used to ignore what was on screen
// ---------------------------------------------------------------------------
describe('Export CSV', () => {
  const cfg = { groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false };
  const twoMonths = {
    items: [
      { row_id: 1, user_id: 'user', date: '03/10/2026', description: 'March thing', category: 'Food & Drink', cost: 3 },
      { row_id: 2, user_id: 'user', date: '02/10/2026', description: 'Feb thing', category: 'Food & Drink', cost: 4 },
    ],
    next_offset: undefined,
  };

  test('with no month selected it exports the whole ledger and the tooltip says so', async () => {
    jest.spyOn(api, 'listExpenses').mockResolvedValue(twoMonths);
    jest.spyOn(configApi, 'getConfig').mockResolvedValue(cfg);
    const exp = jest.spyOn(api, 'exportMyExpensesCsv').mockResolvedValue();
    renderPage();
    await screen.findByText('March thing');
    const btn = screen.getByRole('button', { name: 'Export CSV' });
    fireEvent.click(btn);
    await waitFor(() => expect(exp).toHaveBeenCalledWith(undefined, undefined));
    fireEvent.mouseOver(btn);
    expect(await screen.findByText(/your share of group expenses \(all time\)\. Search and tag filters aren't applied/i)).toBeInTheDocument();
  });

  test('with a month selected it exports exactly that month and relabels the button', async () => {
    jest.spyOn(api, 'listExpenses').mockResolvedValue(twoMonths);
    jest.spyOn(configApi, 'getConfig').mockResolvedValue(cfg);
    const exp = jest.spyOn(api, 'exportMyExpensesCsv').mockResolvedValue();
    renderPage();
    await screen.findByText('March thing');
    fireEvent.mouseDown(screen.getByLabelText('Month'));
    const options = await screen.findAllByRole('option');
    const feb = options.find((o) => /february 2026/i.test(o.textContent || ''));
    expect(feb).toBeDefined();
    fireEvent.click(feb as HTMLElement);
    const btn = await screen.findByRole('button', { name: 'Export month (CSV)' });
    fireEvent.click(btn);
    // 2026 is not a leap year: the last day must be the 28th, not a hard-coded 30/31.
    await waitFor(() => expect(exp).toHaveBeenCalledWith('02/01/2026', '02/28/2026'));
  });
});
