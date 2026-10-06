import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import RegisterPage from './RegisterPage';
import * as authApi from '../api/auth';

jest.mock('framer-motion', () => ({ motion: { div: (p: any) => <div {...p} /> } }));

function renderPage() {
  return render(<MemoryRouter><RegisterPage /></MemoryRouter>);
}

const fill = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), { target: { value } });

afterEach(() => jest.restoreAllMocks());

test('invalid input is explained under each field and never reaches the server', () => {
  const spy = jest.spyOn(authApi, 'register').mockResolvedValue();
  renderPage();
  fill(/^Name/, 'Sam');
  fill(/^Email/, 'not-an-email');
  fill(/^Password/, 'abc');
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
  expect(screen.getByText(/Enter a valid email address, like name@example.com/)).toBeInTheDocument();
  expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
  expect(spy).not.toHaveBeenCalled();
});

test('field errors clear as the user fixes the field', () => {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
  expect(screen.getByText('Enter your name.')).toBeInTheDocument();
  fill(/^Name/, 'Sam');
  expect(screen.queryByText('Enter your name.')).not.toBeInTheDocument();
});

test('server field errors from a 422 are shown on the matching fields', async () => {
  const err = Object.assign(new authApi.ApiError('Registration failed', 422), { fieldErrors: { email: "That email address isn't valid." } });
  jest.spyOn(authApi, 'register').mockRejectedValue(err);
  renderPage();
  fill(/^Name/, 'Sam');
  fill(/^Email/, 'sam@example.com');
  fill(/^Password/, 'longenough');
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
  expect(await screen.findByText("That email address isn't valid.")).toBeInTheDocument();
});

test('a generic 400 keeps the generic message', async () => {
  jest.spyOn(authApi, 'register').mockRejectedValue(new authApi.ApiError('Registration failed', 400));
  renderPage();
  fill(/^Name/, 'Sam');
  fill(/^Email/, 'sam@example.com');
  fill(/^Password/, 'longenough');
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
  expect(await screen.findByText(/Registration failed\. Please check your details/)).toBeInTheDocument();
});

test('the Google button area is hidden until Google actually renders it', () => {
  renderPage();
  // No client id / script in tests: no stray "or" divider above the form.
  expect(screen.queryByText('or')).not.toBeInTheDocument();
});
