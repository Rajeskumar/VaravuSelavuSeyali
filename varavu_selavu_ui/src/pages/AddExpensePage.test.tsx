import { render, screen } from '@testing-library/react';
import AddExpensePage from './AddExpensePage';

test('renders add expense form with optional upload', () => {
  render(<AddExpensePage />);
  expect(screen.getByText('Add New Expense')).toBeInTheDocument();
  expect(screen.getByTestId('file-input')).toBeInTheDocument();
});
