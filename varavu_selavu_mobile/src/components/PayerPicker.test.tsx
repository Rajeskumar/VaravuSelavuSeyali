import { render } from '@testing-library/react-native';
import PayerPicker from './PayerPicker';
import { useAppTheme } from '../context/ThemeContext';

jest.mock('../context/ThemeContext', () => ({
  useAppTheme: jest.fn(),
}));

describe('PayerPicker', () => {
  const mockMembers = [
    { member_id: '1', display_name: 'Alice', status: 'active', role: 'admin' },
    { member_id: '2', display_name: 'Bob', status: 'active', role: 'member' },
  ];

  beforeEach(() => {
    (useAppTheme as jest.Mock).mockReturnValue({
      theme: {
        colors: {
          background: '#fff',
          surface: '#f9f9f9',
          surfaceSecondary: '#f0f0f0',
          primary: '#007AFF',
          text: '#000',
          textSecondary: '#666',
          textTertiary: '#999',
          borderLight: '#e0e0e0',
          error: '#ff3b30',
          success: '#34C759',
        },
      },
    });
  });

  it('renders and defaults to not valid if amount is not met', () => {
    const onValidityChange = jest.fn();
    const { getByText } = render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: '1', amount_paid: 50 }]}
        onChange={() => {}}
        onValidityChange={onValidityChange}
      />
    );
    expect(getByText('Amounts paid must equal total expense ($100.00). Currently: $50.00.')).toBeTruthy();
    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it('validates when exact amount is met', () => {
    const onValidityChange = jest.fn();
    const { getByText } = render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: '1', amount_paid: 100 }]}
        onChange={() => {}}
        onValidityChange={onValidityChange}
      />
    );
    expect(getByText('Payments reconcile ✓')).toBeTruthy();
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });
});
