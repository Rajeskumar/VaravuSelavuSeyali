import { render } from '@testing-library/react-native';
import ItemSplitBoard from './ItemSplitBoard';
import { useAppTheme } from '../context/ThemeContext';

jest.mock('../context/ThemeContext', () => ({
  useAppTheme: jest.fn(),
}));

describe('ItemSplitBoard', () => {
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

  it('shows error if an item is unassigned', () => {
    const onValidityChange = jest.fn();
    const { getByText } = render(
      <ItemSplitBoard
        members={mockMembers}
        items={[
          {
            line_no: 1,
            item_name: 'Coffee',
            line_total: 5.0,
            member_ratios: {}
          }
        ]}
        onChange={() => {}}
        onValidityChange={onValidityChange}
      />
    );
    
    expect(getByText('Item must be assigned to at least one person')).toBeTruthy();
    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it('validates when all items are assigned', () => {
    const onValidityChange = jest.fn();
    const { getByText } = render(
      <ItemSplitBoard
        members={mockMembers}
        items={[
          {
            line_no: 1,
            item_name: 'Coffee',
            line_total: 5.0,
            member_ratios: { '1': 1 }
          }
        ]}
        onChange={() => {}}
        onValidityChange={onValidityChange}
      />
    );
    
    expect(getByText('All items assigned ✓')).toBeTruthy();
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });
});
