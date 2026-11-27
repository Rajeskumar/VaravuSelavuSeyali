import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScannedItemsCard, { ScannedItem } from './ScannedItemsCard';

const items: ScannedItem[] = [
  { line_no: 1, item_name: 'Milk', line_total: 4 },
  { line_no: 2, item_name: 'Bread', line_total: 6 },
];
const mount = (props: Partial<React.ComponentProps<typeof ScannedItemsCard>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ScannedItemsCard items={items} onChange={() => {}} currentAmount={10} {...props} />
    </QueryClientProvider>,
  );

it('says the items match when they add up to the total', () => {
  mount();
  expect(screen.getByRole('status')).toHaveTextContent('Matches total');
});

it('warns how far off the items are and that they must match to save', () => {
  mount({ currentAmount: 12.5 });
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('$2.50 less than the total');
  expect(status).toHaveTextContent('Make them match to save');
});

// TS-FIX-102 (S-22)
it('shows the paid price, the saving, and counts tip — never subtracts the discount again', () => {
  mount({
    items: [{ line_no: 1, item_name: 'Milk', line_total: 8, discount: 2, original_price: 10 }],
    tax: 0.5,
    tip: 1.5,
    currentAmount: 10,
  });
  expect(screen.getByLabelText('Price paid for Milk')).toHaveValue('8');
  expect(screen.getByLabelText('Original price for Milk')).toHaveValue('10');
  expect(screen.getByText('saved $2.00')).toBeInTheDocument();
  expect(screen.getByText('Tip')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Matches total');
});

it('lets the person add an original price the scanner could not read', () => {
  const onChange = jest.fn();
  mount({ items: [{ line_no: 1, item_name: 'Milk', line_total: 8 }], currentAmount: 8, onChange });
  expect(screen.queryByLabelText('Original price for Milk')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add original price for Milk' }));
  fireEvent.change(screen.getByLabelText('Original price for Milk'), { target: { value: '9.5' } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ line_total: 8, original_price: 9.5, discount: 1.5 })]);
});

it('does not accept a minus sign in a price', () => {
  const onChange = jest.fn();
  mount({ onChange });
  fireEvent.change(screen.getByLabelText('Price paid for Milk'), { target: { value: '-3' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ item_name: 'Milk', line_total: 3 })]));
});

it('lists returns and refunds for review and flags old-format prices', () => {
  mount({ review: [{ item_name: 'RETURN SHIRT', amount: 15 }], legacyFormat: true });
  expect(screen.getByText('Not included: returns or refunds')).toBeInTheDocument();
  expect(screen.getByText('RETURN SHIRT')).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent('Prices were adjusted for discounts. Check them before saving.');
});
