import { render, screen } from '@testing-library/react';
import AddExpensePage from './AddExpensePage';

jest.mock('heic2any', () => ({
  default: jest.fn(async () => new Blob(['converted'], { type: 'image/png' })),
}), { virtual: true });

test('renders add expense form with optional upload', () => {
  render(<AddExpensePage />);
  expect(screen.getByText('Add New Expense')).toBeInTheDocument();
  expect(screen.getAllByText(/Upload Receipt/i).length).toBeGreaterThan(0);
  expect(screen.getByTestId('file-input')).toBeInTheDocument();
});
