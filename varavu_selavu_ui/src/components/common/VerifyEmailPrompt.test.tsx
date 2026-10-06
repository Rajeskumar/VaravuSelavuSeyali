import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import VerifyEmailPrompt from './VerifyEmailPrompt';
import * as authApi from '../../api/auth';

afterEach(() => jest.restoreAllMocks());

test('Resend sends the verification email once and confirms it', async () => {
  const spy = jest.spyOn(authApi, 'resendVerification').mockResolvedValue(undefined as any);
  render(<VerifyEmailPrompt />);
  fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /email sent/i })).toBeDisabled());
  expect(spy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent(/check your inbox/i);
});

test('a failed send says so and can be retried', async () => {
  jest.spyOn(authApi, 'resendVerification').mockRejectedValue(new Error('smtp down'));
  render(<VerifyEmailPrompt />);
  fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
  expect(await screen.findByText(/couldn't send the email/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /resend verification email/i })).toBeEnabled();
});

test('"I\'ve verified" re-checks status when a handler is given', () => {
  const again = jest.fn();
  render(<VerifyEmailPrompt onCheckAgain={again} />);
  fireEvent.click(screen.getByRole('button', { name: /i've verified/i }));
  expect(again).toHaveBeenCalled();
});
