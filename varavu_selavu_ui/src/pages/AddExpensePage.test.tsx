import { render, screen, fireEvent } from '@testing-library/react';
import AddExpensePage from './AddExpensePage';

test('toggle between manual and upload', () => {
  render(<AddExpensePage />);
  expect(screen.getByText('Manual')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Upload Receipt'));
  expect(screen.getByText('Parse')).toBeInTheDocument();
});
