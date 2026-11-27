import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { Alert, TextInput } from 'react-native';

let mockEmail = 'one@example.test';
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ userEmail: mockEmail }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('../api/recurring', () => ({ getRecurringDue: jest.fn(), confirmRecurring: jest.fn() }));
jest.mock('../../expenses/utils/expenseEvents', () => ({ refreshExpenseViews: jest.fn() }));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));

import RecurringPrompt from './RecurringPrompt';
import { getRecurringDue, confirmRecurring } from '../api/recurring';
import { isAnyOverlayBusy, resetOverlayGateForTests } from '../../../core/ui/overlayGate';

beforeEach(() => { resetOverlayGateForTests(); (getRecurringDue as jest.Mock).mockReset(); });

test('holds the overlay gate while it checks, and frees it when nothing is due', async () => {
  mockEmail = 'nothing-due@example.test';
  let release: (v: unknown[]) => void = () => {};
  (getRecurringDue as jest.Mock).mockReturnValue(new Promise((r) => { release = r; }));
  render(<RecurringPrompt />);
  expect(isAnyOverlayBusy()).toBe(true);        // the consent sheet must not open underneath a prompt that may be about to
  await act(async () => { release([]); });
  await waitFor(() => expect(isAnyOverlayBusy()).toBe(false));
});
test('a failed check frees the gate too', async () => {
  mockEmail = 'failed@example.test';
  (getRecurringDue as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<RecurringPrompt />);
  await waitFor(() => expect(isAnyOverlayBusy()).toBe(false));
});
test('keeps the gate while the prompt is open and frees it when it unmounts', async () => {
  mockEmail = 'due@example.test';
  (getRecurringDue as jest.Mock).mockResolvedValue([{ template_id: 't1', date_iso: '2026-11-01', suggested_cost: 10, description: 'Rent', category: 'Home' }]);
  const { unmount } = render(<RecurringPrompt />);
  await waitFor(() => expect(getRecurringDue).toHaveBeenCalled());
  await act(async () => {});
  expect(isAnyOverlayBusy()).toBe(true);
  unmount();
  expect(isAnyOverlayBusy()).toBe(false);
});

// The field was rewritten from a number on every key, so "12.50" lost its dot and became 1250 (TS-FIX-103, AC-012).
describe('the amount typed in the due prompt', () => {
  const typeAndConfirm = async (email: string, typed: string) => {
    mockEmail = email;
    (confirmRecurring as jest.Mock).mockReset().mockResolvedValue({});
    (getRecurringDue as jest.Mock).mockResolvedValue([{ template_id: 't1', date_iso: '2026-11-01', suggested_cost: 10, description: 'Rent', category: 'Home' }]);
    const view = render(<RecurringPrompt />);
    await view.findByText('Rent');
    const field = () => view.UNSAFE_getByType(TextInput);
    fireEvent.changeText(field(), '');
    for (const key of typed) fireEvent.changeText(field(), `${field().props.value}${key}`);
    const shown = field().props.value;
    await act(async () => { fireEvent.press(view.getByText('Confirm')); });
    return shown;
  };

  it.each([['12.50', 12.5], ['12,50', 12.5]])('adds %s as typed', async (typed, cost) => {
    expect(await typeAndConfirm(`ok-${typed}@example.test`, typed)).toBe(typed);
    expect(confirmRecurring).toHaveBeenCalledWith([{ template_id: 't1', date_iso: '2026-11-01', cost }]);
  });

  it('adds nothing and says why for an unclear amount', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await typeAndConfirm('unclear@example.test', '1,234.50');
    expect(confirmRecurring).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
  });
});
