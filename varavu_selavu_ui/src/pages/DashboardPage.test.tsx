import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import * as analysisApi from '../api/analysis';
import * as analyticsApi from '../api/analytics';
import * as recurringApi from '../api/recurring';
import * as expensesApi from '../api/expenses';
import * as groupsApi from '../api/groups';
import * as configApi from '../api/config';
import React from 'react';

const combinedPayload: analysisApi.AnalysisResponse = {
  top_categories: ['Food & Drink'],
  category_totals: [{ category: 'Food & Drink', total: 500 }],
  monthly_trend: [{ month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, total: 500 }],
  total_expenses: 500,
  category_expense_details: { 'Food & Drink': [] },
  scope: 'combined',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.setItem('vs_user', 'user');
  jest.spyOn(recurringApi, 'listRecurringTemplates').mockResolvedValue([]);
  jest.spyOn(expensesApi, 'listExpenses').mockResolvedValue({ items: [], next_offset: undefined });
  jest.spyOn(analyticsApi, 'getChangeInsights').mockResolvedValue([]);
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('renders combined totals from the analysis payload', async () => {
  jest.spyOn(analysisApi, 'getAnalysis').mockResolvedValue(combinedPayload);
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false });
  renderPage();
  // TS-DES-111: must fetch the current month specifically, not the whole year —
  // this is the exact assertion that would have caught the original bug (the
  // old version of this test only checked `scope`, which stayed green whether
  // or not `month` was ever sent).
  await waitFor(() => expect(analysisApi.getAnalysis).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'combined', month: new Date().getMonth() + 1 })
  ));
  await waitFor(() => expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0));
});

test('shows My Groups widget and the combined-totals explainer toast on first visit', async () => {
  jest.spyOn(analysisApi, 'getAnalysis').mockResolvedValue(combinedPayload);
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: true });
  jest.spyOn(groupsApi, 'listGroups').mockResolvedValue([
    { group_id: 'g1', name: 'Apartment 4B', group_type: 'home', member_count: 2, my_balance: 12.5, status: 'active', archived_at: null, deleted_at: null },
  ]);
  jest.spyOn(groupsApi, 'listAllMyGroupExpenses').mockResolvedValue([]);
  renderPage();
  expect(await screen.findByText('Apartment 4B')).toBeInTheDocument();
  expect(await screen.findByText(/Your totals now include your share of group expenses\./i)).toBeInTheDocument();
});

test('regression: with no groups (404), dashboard renders without the My Groups widget or toast', async () => {
  jest.spyOn(analysisApi, 'getAnalysis').mockResolvedValue(combinedPayload);
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false });
  renderPage();
  await waitFor(() => expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0));
  expect(screen.queryByText('Apartment 4B')).not.toBeInTheDocument();
});
