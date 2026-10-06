import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordField from './PasswordField';

test('toggles between hidden and visible with an accessible button', () => {
  render(<PasswordField label="Password" value="hunter22" onChange={() => {}} />);
  const input = screen.getByLabelText('Password', { selector: 'input' });
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
});
