import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddExpenseProvider from './AddExpenseScreen';
import { readExpenseDraft, clearExpenseDraft, writeExpenseDraft } from '../utils/expenseDraft';
import { addExpense } from '../api/expenses';
import { listGroups, getGroupDetail } from '../api/groups';

jest.mock('../context/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark') }) };
});
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 'test-token', userEmail: 'user' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../hooks/useTagsEnabled', () => ({ useTagsEnabled: () => ({ enabled: false }) }));
jest.mock('../hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('../hooks/useEntityResolutionEnabled', () => ({ useEntityResolutionEnabled: () => ({ enabled: false }) }));
jest.mock('../utils/expenseDraft', () => ({ readExpenseDraft: jest.fn(), writeExpenseDraft: jest.fn(async () => {}), clearExpenseDraft: jest.fn(async () => {}) }));
jest.mock('../utils/onDeviceOcr', () => ({ recognizeReceipt: jest.fn(), toUploadableJpeg: jest.fn() }));
jest.mock('../components/ReceiptScanScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ReceiptItemsSheet', () => ({ __esModule: true, default: () => null }));
// Disabled auxiliary sheets import native animation; the form's real controls remain under test.
jest.mock('../components/CustomButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../api/expenses', () => ({ addExpense: jest.fn(), categorizeExpense: jest.fn() }));
jest.mock('../api/groups', () => ({ ...jest.requireActual('../api/groups'), listGroups: jest.fn(async () => []), getGroupDetail: jest.fn() }));

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
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save & split' })).toBeNull());
  await act(async () => { await Promise.resolve(); });
  const calls = (writeExpenseDraft as jest.Mock).mock.calls;
  expect(calls[calls.length - 1][1]).toMatchObject({ customized: true, payers: groupDraft.payers, splitValue: groupDraft.splitValue });
});
