import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

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
import { getRecurringDue } from '../api/recurring';
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
