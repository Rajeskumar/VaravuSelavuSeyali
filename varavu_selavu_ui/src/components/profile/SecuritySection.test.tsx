import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import SecuritySection from './SecuritySection';
import DeleteAccountDialog from './DeleteAccountDialog';
import * as authApi from '../../api/auth';
import * as account from '../../api/account';

jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));

function setup(hasPassword = true) {
  jest.spyOn(authApi, 'fetchMe').mockResolvedValue({ email: 'a@x.com', has_password: hasPassword } as any);
  jest.spyOn(account, 'listSessions').mockResolvedValue([
    { family_id: 'f1', signed_in_at: '2026-10-01T10:00:00Z', last_active_at: '2026-10-05T10:00:00Z', current: true },
    { family_id: 'f2', signed_in_at: '2026-09-20T10:00:00Z', last_active_at: '2026-09-21T10:00:00Z', current: false },
  ]);
  const onSignedOut = jest.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><SecuritySection onSignedOut={onSignedOut} /></QueryClientProvider>);
  return { onSignedOut };
}

afterEach(() => jest.restoreAllMocks());

test('change password needs the current one, a matching confirmation, and sends both', async () => {
  const change = jest.spyOn(account, 'changePassword').mockResolvedValue();
  setup();
  const submit = await screen.findByRole('button', { name: 'Change password' });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Current password', { selector: 'input' }), { target: { value: 'old-password-1' } });
  fireEvent.change(screen.getByLabelText('New password', { selector: 'input' }), { target: { value: 'a-brand-new-one' } });
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'different' } });
  expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'a-brand-new-one' } });
  fireEvent.click(submit);
  await waitFor(() => expect(change).toHaveBeenCalledWith({ current_password: 'old-password-1', new_password: 'a-brand-new-one' }));
  expect(await screen.findByText(/other devices have been signed out/i)).toBeInTheDocument();
});

test('a server refusal is shown, not swallowed', async () => {
  jest.spyOn(account, 'changePassword').mockRejectedValue(new Error('Current password is incorrect'));
  setup();
  await screen.findByRole('button', { name: 'Change password' });
  fireEvent.change(screen.getByLabelText('Current password', { selector: 'input' }), { target: { value: 'wrong-wrong-1' } });
  fireEvent.change(screen.getByLabelText('New password', { selector: 'input' }), { target: { value: 'a-brand-new-one' } });
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'a-brand-new-one' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
});

test('a Google-only account is offered "Set a password" with no current-password field', async () => {
  setup(false);
  expect(await screen.findByRole('button', { name: 'Set password' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Current password', { selector: 'input' })).not.toBeInTheDocument();
});

test('sessions list marks this device and lets you sign the others out', async () => {
  const end = jest.spyOn(account, 'endSession').mockResolvedValue();
  setup();
  expect(await screen.findByText('This device')).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', { name: 'Sign out' });
  expect(buttons).toHaveLength(1); // none for the current one
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(end).toHaveBeenCalledWith('f2'));
});

test('"Sign out of all devices" ends every session and signs this one out', async () => {
  const all = jest.spyOn(account, 'signOutEverywhere').mockResolvedValue();
  const { onSignedOut } = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out of all devices' }));
  await waitFor(() => expect(all).toHaveBeenCalled());
  await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
});

describe('DeleteAccountDialog', () => {
  const base = { open: true, email: 'a@x.com', deleting: false, error: null, onCancel: jest.fn() };

  test('says what stays in shared groups and asks for the password', () => {
    const onConfirm = jest.fn();
    render(<DeleteAccountDialog {...base} hasPassword onConfirm={onConfirm} />);
    expect(screen.getByText(/Stays for the people you shared with/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymous User/)).toBeInTheDocument();
    const del = screen.getByRole('button', { name: 'Delete permanently' });
    expect(del).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your password', { selector: 'input' }), { target: { value: 'hunter22hunter' } });
    fireEvent.click(del);
    expect(onConfirm).toHaveBeenCalledWith({ password: 'hunter22hunter' });
  });

  test('a Google-only account types its email instead', () => {
    const onConfirm = jest.fn();
    render(<DeleteAccountDialog {...base} hasPassword={false} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Type a@x.com to confirm'), { target: { value: 'a@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onConfirm).toHaveBeenCalledWith({ confirm_email: 'a@x.com' });
  });

  test('a refusal is shown inside the dialog', () => {
    render(<DeleteAccountDialog {...base} hasPassword error="Enter your password to delete your account" onConfirm={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your password');
  });
});
