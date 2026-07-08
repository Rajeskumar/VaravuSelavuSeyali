import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemInsightsPage from './ItemInsightsPage';
import { MemoryRouter } from 'react-router-dom';
import * as analyticsApi from '../api/analytics';

// Mock the API client
jest.mock('../api/analytics');

describe('ItemInsightsPage', () => {
  beforeEach(() => {
    localStorage.setItem('vs_user', 'test@user.com');
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('renders the empty state when no items are returned', async () => {
    (analyticsApi.getTopItems as jest.Mock).mockResolvedValueOnce([]);
    render(<MemoryRouter><ItemInsightsPage /></MemoryRouter>);

    expect(await screen.findByText(/No item insights yet/i)).toBeInTheDocument();
  });

  it('renders a list of top items', async () => {
    (analyticsApi.getTopItems as jest.Mock).mockResolvedValueOnce([
      { id: '1', normalized_name: 'Fuji Apples', avg_unit_price: 2.5, total_quantity_bought: 10, total_spent: 25.0 },
      { id: '2', normalized_name: 'Whole Milk', avg_unit_price: 4.0, total_quantity_bought: 5, total_spent: 20.0 }
    ]);

    render(<MemoryRouter><ItemInsightsPage /></MemoryRouter>);

    const list = await screen.findByRole('list');
    expect(await within(list).findByText('Fuji Apples')).toBeInTheDocument();
    expect(within(list).getByText('Whole Milk')).toBeInTheDocument();
    expect(screen.getAllByText(/\$25.00/i).length).toBeGreaterThan(0);
  });

  it('loads and displays details when an item is clicked', async () => {
    (analyticsApi.getTopItems as jest.Mock).mockResolvedValueOnce([
      { id: '1', normalized_name: 'Fuji Apples', avg_unit_price: 2.5, total_quantity_bought: 10, total_spent: 25.0 }
    ]);
    (analyticsApi.getItemDetail as jest.Mock).mockResolvedValueOnce({
      id: '1',
      normalized_name: 'Fuji Apples',
      avg_unit_price: 2.5,
      min_price: 1.5,
      max_price: 3.0,
      total_quantity_bought: 10,
      total_spent: 25.0,
      // 2+ points required for the price history chart to render
      price_history: [
        { date: '2025-09-01T12:00:00Z', store_name: 'Walmart', unit_price: 2.25, quantity: 4 },
        { date: '2025-10-01T12:00:00Z', store_name: 'Walmart', unit_price: 2.5, quantity: 4 }
      ],
      // 2+ stores required to clear the store-comparison quality gate
      store_comparison: [
        { store_name: 'Walmart', avg_price: 2.5, min_price: 2.5, max_price: 2.5, purchase_count: 1 },
        { store_name: 'Target', avg_price: 2.75, min_price: 2.75, max_price: 2.75, purchase_count: 1 }
      ]
    });

    render(<MemoryRouter><ItemInsightsPage /></MemoryRouter>);

    // Click the item (within the list, since the summary card also shows its name)
    const list = await screen.findByRole('list');
    const itemButton = within(list).getByText('Fuji Apples');
    userEvent.click(itemButton);

    // Wait for detail view to load
    expect(await screen.findByText(/Where You've Bought This/i)).toBeInTheDocument();

    // Check specific details
    expect(screen.getByText(/Price History/i)).toBeInTheDocument();
    expect(screen.getByText(/Purchase History/i)).toBeInTheDocument();

    // Back button works
    userEvent.click(screen.getByTestId('ArrowBackRoundedIcon'));
    expect(screen.queryByText(/Where You've Bought This/i)).not.toBeInTheDocument();
  });
});
