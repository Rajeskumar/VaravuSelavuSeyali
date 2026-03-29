import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

    expect(await screen.findByText('Fuji Apples')).toBeInTheDocument();
    expect(screen.getByText('Whole Milk')).toBeInTheDocument();
    expect(screen.getByText(/\$25.00/i)).toBeInTheDocument();
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
      price_history: [
        { date: '2025-10-01T12:00:00Z', store_name: 'Walmart', unit_price: 2.5, quantity: 4 }
      ],
      store_comparison: [
        { store_name: 'Walmart', avg_price: 2.5, min_price: 2.5, max_price: 2.5, purchase_count: 1 }
      ]
    });

    render(<MemoryRouter><ItemInsightsPage /></MemoryRouter>);

    // Click the item
    const itemButton = await screen.findByText('Fuji Apples');
    userEvent.click(itemButton);

    // Wait for detail view to load
    expect(await screen.findByText(/Price Summary/i)).toBeInTheDocument();
    
    // Check specific details
    expect(screen.getByText(/Store Comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Price History/i)).toBeInTheDocument();
    
    // Back button works
    userEvent.click(screen.getByTestId('ArrowBackIcon'));
    expect(screen.queryByText(/Price Summary/i)).not.toBeInTheDocument();
  });
});
