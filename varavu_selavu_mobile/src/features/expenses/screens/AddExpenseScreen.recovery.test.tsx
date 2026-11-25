import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddExpenseProvider from './AddExpenseScreen';
import { readExpenseDraft, clearExpenseDraft, writeExpenseDraft } from '../utils/expenseDraft';
import { addExpense } from '../api/expenses';
import { listGroups, getGroupDetail } from '../../groups/api/groups';

jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark') }) };
});
jest.mock('../../../core/auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'test-token', userEmail: 'user' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../tags/hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('../../receipts/hooks/useEntityResolutionEnabled', () => ({ useEntityResolutionEnabled: () => ({ enabled: false }) }));
jest.mock('../utils/expenseDraft', () => ({ readExpenseDraft: jest.fn(), writeExpenseDraft: jest.fn(async () => {}), clearExpenseDraft: jest.fn(async () => {}) }));
jest.mock('../../receipts/utils/onDeviceOcr', () => ({ recognizeReceipt: jest.fn(), toUploadableJpeg: jest.fn() }));
jest.mock('../../receipts/components/ReceiptScanScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../receipts/components/ReceiptItemsSheet', () => ({ __esModule: true, default: () => null }));
// Disabled auxiliary sheets import native animation; the form's real controls remain under test.
jest.mock('../../../core/ui/CustomButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../core/ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../api/expenses', () => ({ addExpense: jest.fn(), categorizeExpense: jest.fn() }));
jest.mock('../../groups/api/groups', () => ({ ...jest.requireActual('../../groups/api/groups'), listGroups: jest.fn(async () => []), getGroupDetail: jest.fn() }));

const draft = {
  amt: '7.89', desc: 'Recovered native coffee', expenseDate: new Date(2026, 9, 6).getTime(),
  merchantName: '', mainCategory: 'Other', subcategory: 'General', userPickedCategory: true, userPickedMerchant: true,
  recurring: false, cardId: null, who: 'me', scannedItems: [], scannedTax: 0, scannedDiscount: 0,
  scannedPurchasedAt: null, scannedFingerprint: null, assignments: {}, tagNames: [], payers: [],
  splitValue: { type: 'equal', entries: [] }, customized: false, unknownOutcome: false,
};
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AddExpenseProvider><></></AddExpenseProvider></QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  (readExpenseDraft as jest.Mock).mockResolvedValue(draft);
  (listGroups as jest.Mock).mockResolvedValue([]);
});

test('restores the native form for the authenticated account without submitting it', async () => {
  mount();
  const description = await screen.findByPlaceholderText('What was it? (AI suggests the category)');
  expect(description.props.value).toBe('Recovered native coffee');
  expect(readExpenseDraft).toHaveBeenCalledWith('user');
  expect(addExpense).not.toHaveBeenCalled();
});

test('an interrupted native save requires checking records before another submission', async () => {
  (readExpenseDraft as jest.Mock).mockResolvedValue({ ...draft, unknownOutcome: true });
  mount();
  await screen.findByText(/The save outcome is unknown/);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(addExpense).not.toHaveBeenCalled();
  expect(clearExpenseDraft).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('I checked Expenses — allow another save'));
  await waitFor(() => expect(screen.queryByText(/The save outcome is unknown/)).toBeNull());
});

test('closing a recovered group draft preserves its customized payers and split', async () => {
  const groupDraft = { ...draft, who: 'trip', customized: true,
    payers: [{ member_id: 'me', amount_paid: 7.89 }],
    splitValue: { type: 'exact', entries: [{ member_id: 'me', value: 3 }, { member_id: 'other', value: 4.89 }] },
  };
  (readExpenseDraft as jest.Mock).mockResolvedValue(groupDraft);
  (listGroups as jest.Mock).mockResolvedValue([{ group_id: 'trip', name: 'Trip', status: 'active' }]);
  (getGroupDetail as jest.Mock).mockResolvedValue({ group_id: 'trip', name: 'Trip', members: [
    { member_id: 'me', user_email: 'user', display_name: 'Me' }, { member_id: 'other', display_name: 'Other' },
  ] });
  mount();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save & split' })).toBeEnabled());
  // Close hides the sheet from an Animated completion callback. Run that 300ms animation on
  // fake timers inside act(): left on real timers, the callback's setVisible(false) lands
  // outside any act() scope, which React 19's test renderer doesn't reliably commit, so the
  // sheet looked like it never closed (the component itself was fine).
  jest.useFakeTimers();
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    act(() => { jest.advanceTimersByTime(1000); });
  } finally {
    jest.useRealTimers();
  }
  expect(screen.queryByRole('button', { name: 'Save & split' })).toBeNull();
  await act(async () => { await Promise.resolve(); });
  const calls = (writeExpenseDraft as jest.Mock).mock.calls;
  expect(calls[calls.length - 1][1]).toMatchObject({ customized: true, payers: groupDraft.payers, splitValue: groupDraft.splitValue });
});

test('the sheet container is not an accessibility element, so the keypad and Save stay individually reachable', async () => {
  // A Pressable is accessible by default; on iOS an accessible container collapses its whole subtree into ONE
  // element ("Discard draft, Type, Scan, Close, $0.00, ..."), so VoiceOver and UI tests cannot reach the keys.
  mount();
  await screen.findByPlaceholderText('What was it? (AI suggests the category)');
  expect(screen.getByTestId('addExpense.sheet')).toHaveProp('accessible', false);
  // Pressable also defaults focusable to true, which on Android can leave the wrapper as a TalkBack focus stop.
  expect(screen.getByTestId('addExpense.sheet')).toHaveProp('focusable', false);
});

test('keypad keys are buttons with spoken names, including the two that are only glyphs', async () => {
  mount();
  await screen.findByPlaceholderText('What was it? (AI suggests the category)');
  for (const key of ['1', '5', '0']) {
    expect(screen.getByTestId(`addExpense.key.${key}`)).toHaveProp('accessibilityRole', 'button');
  }
  expect(screen.getByTestId('addExpense.key.dot')).toHaveProp('accessibilityLabel', 'Decimal point');
  expect(screen.getByTestId('addExpense.key.backspace')).toHaveProp('accessibilityLabel', 'Delete');
  expect(screen.getByTestId('addExpense.key.dot')).toHaveProp('accessibilityRole', 'button');
});
