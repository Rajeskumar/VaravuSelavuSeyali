import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddExpenseForm from './AddExpenseForm';
import * as api from '../../api/expenses';

// Ensure parseReceipt mock returns main_category_name and category_name
const mockDraft = {
  header: {
    merchant_name: 'Store',
    purchased_at: '',
    amount: 1,
    tax: 0,
    tip: 0,
    discount: 0,
    description: 'Receipt import',
    main_category_name: 'Food & Drink',
    category_name: 'Groceries',
  },
  items: [{ line_no: 1, item_name: 'Item', line_total: 1, category_name: 'Groceries' }],
  warnings: [],
  fingerprint: 'fp',
};

test('add and delete items, save enabled on mismatch', async () => {
  jest.spyOn(api, 'parseReceipt').mockResolvedValue(mockDraft);
  render(<AddExpenseForm />);
  const file = new File(['dummy'], 'r.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
  fireEvent.click(screen.getByText('Parse Receipt'));
  await waitFor(() => screen.getByText('Items'));

  fireEvent.click(screen.getByText('Add Item'));
  expect(screen.getAllByLabelText('Name').length).toBe(2);

  fireEvent.click(screen.getAllByText('Delete')[0]);
  expect(screen.getAllByLabelText('Name').length).toBe(1);

  fireEvent.change(screen.getByLabelText(/Cost \(USD\)/i), { target: { value: '2' } });
  expect(screen.getByText('Totals mismatch')).toBeInTheDocument();
  expect(screen.getByText('Add Expense')).not.toBeDisabled();
});
