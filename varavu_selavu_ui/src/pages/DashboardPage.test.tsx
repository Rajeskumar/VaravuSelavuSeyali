import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { QuickCaptureProvider } from '../context/QuickCaptureContext';
import * as analysisApi from '../api/analysis';
import * as analyticsApi from '../api/analytics';
import * as recurringApi from '../api/recurring';
import * as expensesApi from '../api/expenses';
import * as groupsApi from '../api/groups';
import * as configApi from '../api/config';
import * as budgetsApi from '../api/budgets';
import * as cardsApi from '../api/cards';
import React from 'react';

// heic2any needs a Web Worker, which jsdom lacks; same mock as ExpensesPage.test.tsx.
jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));

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
        <QuickCaptureProvider>
          <DashboardPage />
        </QuickCaptureProvider>
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
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
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
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: true, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
  jest.spyOn(groupsApi, 'listGroups').mockResolvedValue([
    { group_id: 'g1', name: 'Apartment 4B', group_type: 'home', currency: 'USD', member_count: 2, my_balance: 12.5, status: 'active', archived_at: null, deleted_at: null },
  ]);
  jest.spyOn(groupsApi, 'listAllMyGroupExpenses').mockResolvedValue([]);
  renderPage();
  expect(await screen.findByText('Apartment 4B')).toBeInTheDocument();
  expect(await screen.findByText(/Your totals now include your share of group expenses\./i)).toBeInTheDocument();
});

test('regression: with no groups (404), dashboard renders without the My Groups widget or toast', async () => {
  jest.spyOn(analysisApi, 'getAnalysis').mockResolvedValue(combinedPayload);
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: false, tags_enabled: false });
  renderPage();
  await waitFor(() => expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0));
  expect(screen.queryByText('Apartment 4B')).not.toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// First-run checklist and the budget nudge (readiness review 2026-10-05)
// ---------------------------------------------------------------------------
describe('first-run guidance', () => {
  const allOn = { groups_enabled: true, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: true, tags_enabled: false };

  beforeEach(() => {
    jest.spyOn(analysisApi, 'getAnalysis').mockResolvedValue({ ...combinedPayload, total_expenses: 0, category_totals: [], monthly_trend: [] });
    jest.spyOn(configApi, 'getConfig').mockResolvedValue(allOn);
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValue([]);
    jest.spyOn(groupsApi, 'listAllMyGroupExpenses').mockResolvedValue([]);
    jest.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([]);
    jest.spyOn(cardsApi, 'listMyCards').mockResolvedValue([]);
    jest.spyOn(cardsApi, 'getCardCoach').mockResolvedValue({ total_estimated_gap: 0, by_category: [], by_merchant: [], by_card: [] } as any);
  });

  test('a brand-new account sees the four getting-started steps, and no separate budget prompt yet', async () => {
    renderPage();
    const checklist = await screen.findByRole('region', { name: 'Getting started' });
    for (const step of ['Log your first expense', 'Split with a group', 'Set a budget', 'Add a credit card']) {
      expect(checklist).toHaveTextContent(step);
    }
    expect(checklist).toHaveTextContent('0 of 4 done');
    // The standalone "Set a budget" card would duplicate the checklist step.
    expect(screen.getAllByText('Set a budget')).toHaveLength(1);
  });

  test('steps tick off as the product is used, and the checklist can be dismissed for good', async () => {
    jest.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([{ id: 'b1', status: 'on_track' } as any]);
    jest.spyOn(cardsApi, 'listMyCards').mockResolvedValue([{ id: 'c1' } as any]);
    renderPage();
    const checklist = await screen.findByRole('region', { name: 'Getting started' });
    expect(checklist).toHaveTextContent('2 of 4 done');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }));
    expect(screen.queryByRole('region', { name: 'Getting started' })).not.toBeInTheDocument();
    expect(localStorage.getItem('vs_getting_started_dismissed_v1')).toBe('1');
  });

  test('an established account (many expenses) never sees the checklist', async () => {
    jest.spyOn(expensesApi, 'listExpenses').mockResolvedValue({
      items: Array.from({ length: 12 }, (_, i) => ({ row_id: i, user_id: 'user', date: '10/01/2026', description: `E${i}`, category: 'Food & Drink', cost: 5 })),
      next_offset: undefined,
    });
    renderPage();
    await screen.findByText('E0');
    expect(screen.queryByRole('region', { name: 'Getting started' })).not.toBeInTheDocument();
  });
});
