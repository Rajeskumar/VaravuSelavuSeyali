import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MerchantsTab from './MerchantsTab';
import { MemoryRouter } from 'react-router-dom';
import * as analyticsApi from '../../api/analytics';

// Mock the API client
jest.mock('../../api/analytics');

// TS-DES-205 — migrated from pages/MerchantInsightsPage.test.tsx (that page is deleted; this tab
// component is its replacement, mounted inside ExpenseAnalysisPage's SubTabBar).
describe('MerchantsTab', () => {
  beforeEach(() => {
    localStorage.setItem('vs_user', 'test@user.com');
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('renders the empty state when no merchants are returned', async () => {
    (analyticsApi.getTopMerchants as jest.Mock).mockResolvedValueOnce([]);
    render(<MemoryRouter><MerchantsTab /></MemoryRouter>);

    expect(await screen.findByText(/No merchant insights yet/i)).toBeInTheDocument();
  });

  it('renders a list of top merchants', async () => {
    (analyticsApi.getTopMerchants as jest.Mock).mockResolvedValueOnce([
      { id: '1', merchant_name: 'Costco', total_spent: 450.0, transaction_count: 3 },
      { id: '2', merchant_name: 'Target', total_spent: 120.0, transaction_count: 5 }
    ]);

    render(<MemoryRouter><MerchantsTab /></MemoryRouter>);

    const list = await screen.findByRole('list');
    expect(await within(list).findByText('Costco')).toBeInTheDocument();
    expect(within(list).getByText('Target')).toBeInTheDocument();
    // Top Merchant summary card + list row both show Costco's total
    expect(screen.getAllByText(/\$450.00/i).length).toBeGreaterThan(0);
    expect(screen.getByText('5 visits')).toBeInTheDocument();
  });

  it('loads and displays details when a merchant is clicked', async () => {
    (analyticsApi.getTopMerchants as jest.Mock).mockResolvedValueOnce([
      { id: '1', merchant_name: 'Costco', total_spent: 450.0, transaction_count: 3 }
    ]);
    (analyticsApi.getMerchantDetail as jest.Mock).mockResolvedValueOnce({
      id: '1',
      merchant_name: 'Costco',
      total_spent: 450.0,
      transaction_count: 3,
      monthly_aggregates: [
        { year: 2025, month: 10, total_spent: 450.0, transaction_count: 3 }
      ],
      items_bought: [
        { item_name: 'Paper Towels', avg_price: 25.0, purchase_count: 2, total_quantity: 2 }
      ]
    });

    render(<MemoryRouter><MerchantsTab /></MemoryRouter>);

    // Click the merchant (within the list, since the summary card also shows its name)
    const list = await screen.findByRole('list');
    const merchantButton = within(list).getByText('Costco');
    userEvent.click(merchantButton);

    // Wait for detail view to load
    expect(await screen.findByText(/Monthly Spend/i)).toBeInTheDocument();

    // Check specific details
    expect(screen.getByText(/What You Buy Here/i)).toBeInTheDocument();
    expect(screen.getByText('Paper Towels')).toBeInTheDocument();

    // Back button
    userEvent.click(screen.getByTestId('ArrowBackRoundedIcon'));
    expect(screen.queryByText(/Monthly Spend/i)).not.toBeInTheDocument();
  });
});
