import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScannedItemsCard from './ScannedItemsCard';

const items = [
  { line_no: 1, item_name: 'Milk', line_total: 4 },
  { line_no: 2, item_name: 'Bread', line_total: 6 },
];
const mount = (currentAmount: number) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ScannedItemsCard items={items} onChange={() => {}} currentAmount={currentAmount} />
    </QueryClientProvider>,
  );

it('says the items match when they add up to the total', () => {
  mount(10);
  expect(screen.getByRole('status')).toHaveTextContent('Matches total');
});

it('warns how far off the items are and what to do before saving', () => {
  mount(12.5);
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('$2.50 less than the expense total');
  expect(status).toHaveTextContent('Fix an item or the total to save');
});
