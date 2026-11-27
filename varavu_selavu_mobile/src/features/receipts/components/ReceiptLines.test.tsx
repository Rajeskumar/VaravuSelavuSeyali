/** TS-FIX-102 (S-22): receipt review on mobile — paid prices, savings, tip, review lines, blocked Save. */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ScannedItemsCard, { ScannedItem } from './ScannedItemsCard';
import ReceiptItemsSheet from './ReceiptItemsSheet';
import { darkTheme } from '../../../core/theme/theme';

jest.mock('../../../core/theme/ThemeContext', () => ({
  useAppTheme: () => ({ theme: require('../../../core/theme/theme').darkTheme }),
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../hooks/useEntityResolutionEnabled', () => ({ useEntityResolutionEnabled: () => ({ enabled: false }) }));
jest.mock('../../../core/ui/TypeaheadInput', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeValue }: any) => <TextInput value={value} onChangeText={onChangeValue} />;
});

const milk: ScannedItem = { line_no: 1, item_name: 'Milk', line_total: 8, discount: 2, original_price: 10 };

describe('ScannedItemsCard (mobile)', () => {
  it('shows the paid price and saving, counts tax and tip, and never subtracts the discount again', () => {
    const { getByLabelText, getByText } = render(
      <ScannedItemsCard theme={darkTheme} items={[milk]} onChange={() => {}} tax={0.5} tip={1.5} currentAmount={10} />,
    );
    expect(getByLabelText('Price paid for Milk').props.value).toBe('8');
    expect(getByLabelText('Original price for Milk').props.value).toBe('10');
    expect(getByText('saved $2.00')).toBeTruthy();
    expect(getByText('Tip')).toBeTruthy();
    expect(getByText('Matches total')).toBeTruthy();
  });

  it('adds an original price the scanner could not read', () => {
    const onChange = jest.fn();
    const { getByLabelText, queryByLabelText } = render(
      <ScannedItemsCard theme={darkTheme} items={[{ line_no: 1, item_name: 'Milk', line_total: 8 }]} onChange={onChange} currentAmount={8} />,
    );
    expect(queryByLabelText('Original price for Milk')).toBeNull();
    fireEvent.press(getByLabelText('Add original price for Milk'));
    fireEvent.changeText(getByLabelText('Original price for Milk'), '9.5');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ line_total: 8, original_price: 9.5, discount: 1.5 })]);
  });

  it('drops a minus sign and lists returns for review', () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = render(
      <ScannedItemsCard theme={darkTheme} items={[milk]} onChange={onChange} currentAmount={8}
        review={[{ item_name: 'RETURN SHIRT', amount: 15 }]} legacyFormat />,
    );
    fireEvent.changeText(getByLabelText('Price paid for Milk'), '-3');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ line_total: 3 })]);
    expect(getByText('Not included: returns or refunds')).toBeTruthy();
    expect(getByText('RETURN SHIRT')).toBeTruthy();
    expect(getByText('Prices were adjusted for discounts. Check them before saving.')).toBeTruthy();
  });
});

describe('ReceiptItemsSheet (mobile)', () => {
  const base = {
    visible: true, onClose: () => {}, merchant: 'Costco', items: [milk], tax: 0, tip: 0, grouped: true,
    splitLabel: 'Split equally among 2', yourShare: 4, saving: false, canSave: true, onEditItems: () => {},
  };

  it('has no per-item assignment and saves when the total matches', () => {
    const onSave = jest.fn();
    const { getByText, queryByText } = render(<ReceiptItemsSheet {...base} amount={8} onSave={onSave} />);
    expect(getByText(/Split equally among 2/)).toBeTruthy();
    expect(queryByText(/assign/i)).toBeNull();
    expect(getByText('Saved $2.00')).toBeTruthy();
    fireEvent.press(getByText('Save 1 item'));
    expect(onSave).toHaveBeenCalled();
  });

  it('blocks Save and says why when the total does not match', () => {
    const onSave = jest.fn();
    const { getByText } = render(<ReceiptItemsSheet {...base} amount={10} onSave={onSave} />);
    expect(getByText(/come to \$8.00, not \$10.00/)).toBeTruthy();
    // A disabled button lets the press bubble to the sheet panel, which needs an event object.
    fireEvent.press(getByText('Save 1 item'), { stopPropagation: () => {} });
    expect(onSave).not.toHaveBeenCalled();
  });
});
