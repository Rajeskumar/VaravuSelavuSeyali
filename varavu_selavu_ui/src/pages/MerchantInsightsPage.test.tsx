import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MerchantInsightsPage from './MerchantInsightsPage';
import * as analyticsApi from '../api/analytics';

// Mock the API client
jest.mock('../api/analytics');

describe('MerchantInsightsPage', () => {
  beforeEach(() => {
    localStorage.setItem('vs_user', 'test@user.com');
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('renders the empty state when no merchants are returned', async () => {
    (analyticsApi.getTopMerchants as jest.Mock).mockResolvedValueOnce([]);
    render(<MerchantInsightsPage />);

    expect(await screen.findByText(/No merchant insights yet/i)).toBeInTheDocument();
  });

  it('renders a list of top merchants', async () => {
    (analyticsApi.getTopMerchants as jest.Mock).mockResolvedValueOnce([
      { id: '1', merchant_name: 'Costco', total_spent: 450.0, transaction_count: 3 },
      { id: '2', merchant_name: 'Target', total_spent: 120.0, transaction_count: 5 }
    ]);

    render(<MerchantInsightsPage />);

    expect(await screen.findByText('Costco')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText(/\$450.00/i)).toBeInTheDocument();
    expect(screen.getByText('5 transactions')).toBeInTheDocument();
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

    render(<MerchantInsightsPage />);

    // Click the merchant
    const merchantButton = await screen.findByText('Costco');
    userEvent.click(merchantButton);

    // Wait for detail view to load
    expect(await screen.findByText(/Monthly Spending/i)).toBeInTheDocument();
    
    // Check specific details
    expect(screen.getByText(/Items Bought Here/i)).toBeInTheDocument();
    expect(screen.getByText('Paper Towels')).toBeInTheDocument();
    
    // Back button
    userEvent.click(screen.getByTestId('ArrowBackIcon'));
    expect(screen.queryByText(/Monthly Spending/i)).not.toBeInTheDocument();
  });
});
