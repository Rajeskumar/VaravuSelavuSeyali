import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddExpenseForm from './AddExpenseForm';
import * as api from '../../api/expenses';

jest.mock('heic2any', () => ({
  default: jest.fn(async () => new Blob(['converted'], { type: 'image/png' })),
}), { virtual: true });

// Ensure parseReceipt mock returns main_category_name and category_name
const mockDraft = {
  header: {
    merchant_name: 'Store',
    purchased_at: '',
    amount: 1,
    tax: 0,
    tip: 0,
    discount: 0,
    description: '',
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
  expect(screen.getAllByText(/Upload Receipt/i).length).toBeGreaterThan(0);
  const file = new File(['dummy'], 'r.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /Parse Receipt/i }));
  await waitFor(() => screen.getByText('Items'));

  expect((screen.getByLabelText(/Description/i) as HTMLInputElement).value).toBe('Store');

  fireEvent.click(screen.getByText('Add Item'));
  expect(screen.getAllByLabelText('Name').length).toBe(2);

  fireEvent.click(screen.getAllByText('Delete')[0]);
  expect(screen.getAllByLabelText('Name').length).toBe(1);

  fireEvent.change(screen.getByLabelText(/Cost \(USD\)/i), { target: { value: '2' } });
  expect(
    screen.getByText(content => content.startsWith('Totals mismatch by $'))
  ).toBeInTheDocument();
  expect(screen.getByText('Add Expense')).toBeDisabled();
});
