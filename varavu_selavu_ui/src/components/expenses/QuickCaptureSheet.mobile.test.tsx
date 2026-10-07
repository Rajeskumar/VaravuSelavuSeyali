import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QuickCaptureProvider, useQuickCapture } from '../../context/QuickCaptureContext';
import * as groupsApi from '../../api/groups';
import { RequestError } from '../../api/request';
import * as logHook from '../../hooks/useLogExpense';
import * as expensesApi from '../../api/expenses';
import * as configApi from '../../api/config';

jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));

// jsdom has no matchMedia, so MUI's useMediaQuery is false and the sheet renders its phone layout
// (bottom drawer + keypad) — exactly the layout the mobile review covered.
function Opener() {
  const { openQuickCapture } = useQuickCapture();
  return <button onClick={() => openQuickCapture()}>open-sheet</button>;
}

async function openSheet() {
  localStorage.setItem('vs_user', 'user');
  jest.spyOn(groupsApi, 'listGroups').mockResolvedValue([]);
  jest.spyOn(configApi, 'getConfig').mockResolvedValue({ groups_enabled: false, entity_resolution_enabled: false, budgets_enabled: false, card_coach_enabled: false, tags_enabled: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><QuickCaptureProvider><Opener /></QuickCaptureProvider></MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('open-sheet'));
  return screen.findByRole('textbox', { name: 'Amount' });
}

afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

test('the amount is a labelled, editable input with a decimal keyboard (it was a plain div)', async () => {
  const amount = await openSheet();
  expect(amount.tagName).toBe('INPUT');
  expect(amount).toHaveAttribute('inputmode', 'decimal');
  fireEvent.change(amount, { target: { value: '12.5' } });
  expect(amount).toHaveValue('12.5');
});

test('every keypad key is a real, labelled button reachable by keyboard', async () => {
  await openSheet();
  for (const name of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Decimal point', 'Backspace']) {
    const key = screen.getByRole('button', { name });
    expect(key.tagName).toBe('BUTTON');
    expect(key).not.toHaveAttribute('tabindex', '-1');
  }
});

test('keypad presses and typing edit the same amount', async () => {
  const amount = await openSheet();
  fireEvent.click(screen.getByRole('button', { name: '4' }));
  fireEvent.click(screen.getByRole('button', { name: 'Decimal point' }));
  fireEvent.click(screen.getByRole('button', { name: '5' }));
  expect(amount).toHaveValue('4.5');
  fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
  expect(amount).toHaveValue('4.');
  fireEvent.change(amount, { target: { value: '30' } });
  expect(amount).toHaveValue('30');
});

test('a negative amount is rejected with a message instead of becoming positive', async () => {
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '-5' } });
  expect(amount).toHaveValue('');
  expect(screen.getByRole('alert')).toHaveTextContent("Amounts can't be negative");
});

test('the close button is a 44px target', async () => {
  await openSheet();
  const close = screen.getAllByRole('button', { name: 'Close' })[0];
  const style = getComputedStyle(close);
  expect(style.width).toBe('44px');
  expect(style.height).toBe('44px');
});


test('restores an unsaved expense after the application remounts', async () => {
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '12.34' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Draft coffee' } });
  cleanup();
  await openSheet();
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('12.34');
  expect(screen.getByPlaceholderText('Description')).toHaveValue('Draft coffee');
});

test('auth loss hides the form and preserves its draft for the same account', async () => {
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '12.34' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Draft coffee' } });
  act(() => { localStorage.removeItem('vs_user'); window.dispatchEvent(new Event('storage')); });
  expect(screen.queryByRole('button', { name: 'Save expense' })).not.toBeInTheDocument();
  act(() => { localStorage.setItem('vs_user', 'user'); window.dispatchEvent(new Event('vs_auth_changed')); });
  fireEvent.click(screen.getByText('open-sheet'));
  expect(await screen.findByRole('textbox', { name: 'Amount' })).toHaveValue('12.34');
});

test('a different account never receives the previous account draft', async () => {
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '12.34' } });
  cleanup();
  localStorage.setItem('vs_user', 'different-user');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><QuickCaptureProvider><Opener /></QuickCaptureProvider></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByText('open-sheet'));
  expect(await screen.findByRole('textbox', { name: 'Amount' })).toHaveValue('');
});


test('closing retains the draft and explicit discard removes it after confirmation', async () => {
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByText('open-sheet'));
  expect(await screen.findByRole('textbox', { name: 'Amount' })).toHaveValue('9');
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
  fireEvent.click(screen.getByText('open-sheet'));
  expect(await screen.findByRole('textbox', { name: 'Amount' })).toHaveValue('');
});

test('an unknown save outcome retains input and blocks another save until records are checked', async () => {
  const save = jest.fn().mockRejectedValue(new RequestError('Connection lost', true));
  jest.spyOn(logHook, 'useLogExpense').mockReturnValue({ logPersonal: save, logToGroup: jest.fn(), logPersonalWithItems: jest.fn(), logToGroupWithItems: jest.fn() });
  jest.spyOn(expensesApi, 'suggestCategory').mockResolvedValue({ main_category: 'Other', subcategory: 'General' });
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '1.23' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Coffee' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
  await screen.findByText(/The save outcome is unknown/);
  expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('1.23');
  expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /I checked Expenses/ }));
  expect(screen.getByRole('button', { name: 'Save expense' })).toBeEnabled();
  expect(save).toHaveBeenCalledTimes(1);
});

test('a successful double click saves once and clears the recoverable draft', async () => {
  const save = jest.fn().mockResolvedValue({});
  jest.spyOn(logHook, 'useLogExpense').mockReturnValue({ logPersonal: save, logToGroup: jest.fn(), logPersonalWithItems: jest.fn(), logToGroupWithItems: jest.fn() });
  jest.spyOn(expensesApi, 'suggestCategory').mockResolvedValue({ main_category: 'Other', subcategory: 'General' });
  const amount = await openSheet();
  fireEvent.change(amount, { target: { value: '1.23' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Coffee' } });
  const button = screen.getByRole('button', { name: 'Save expense' });
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByText('Logged to your personal ledger.');
  expect(save).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('vs_expense_draft_v1')).toBeNull();
});
