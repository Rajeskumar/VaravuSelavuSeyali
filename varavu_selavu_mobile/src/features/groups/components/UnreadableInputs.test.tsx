/** Typed key by key, "1,234.50" used to keep 1.23 and could be saved (TS-FIX-103, AC-009). */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SplitEditor, { SplitEditorValue, SplitType, computeSplitValid } from './SplitEditor';
import PayerPicker, { computePayersValid } from './PayerPicker';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});

const members: any = [{ member_id: 'bob', display_name: 'Bob', status: 'active' }];
const typeKeys = (label: string, keys: string) => {
  fireEvent.changeText(screen.getByLabelText(label), '');
  for (const key of keys) fireEvent.changeText(screen.getByLabelText(label), `${screen.getByLabelText(label).props.value}${key}`);
};

// After a lone dot a third decimal is still not taken (see acceptsAmountText), so "1.234,50" shows as "1.23,50".
describe.each([['1,234.50', '1,234.50'], ['1,000', '1,000'], ['1.234,50', '1.23,50']])('typing %s', (typed, shown) => {
  it.each<SplitType>(['exact', 'percentage', 'shares', 'adjustment'])('keeps it visible and cannot be saved in a %s split', (type) => {
    const seen = jest.fn();
    const Host = () => {
      const [value, setValue] = useState<SplitEditorValue>({ type, entries: [{ member_id: 'bob' }] });
      return <SplitEditor members={members} totalAmount={5000} value={value} onChange={(v) => { seen(v); setValue(v); }} />;
    };
    render(<Host />);
    typeKeys(`${type} for Bob`, typed);
    expect(screen.getByLabelText(`${type} for Bob`).props.value).toBe(shown);
    expect(computeSplitValid(seen.mock.lastCall[0], 5000)).toBe(false);
    expect(screen.getByText(/Check the amounts/)).toBeTruthy();
  });

  it('keeps it visible and cannot be saved for a payer', () => {
    const seen = jest.fn();
    const Host = () => {
      const [payers, setPayers] = useState([{ member_id: 'bob', amount_paid: 0 }]);
      return <PayerPicker members={members} amount={1.23} payers={payers} onChange={(p) => { seen(p); setPayers(p as any); }} />;
    };
    render(<Host />);
    typeKeys('Amount paid by Bob', typed);
    expect(screen.getByLabelText('Amount paid by Bob').props.value).toBe(shown);
    expect(computePayersValid(seen.mock.lastCall[0], 1.23)).toBe(false);
    expect(screen.getByText(/Check the amounts/)).toBeTruthy();
  });
});

// The server stores a split without values as `value: null` (a group's default Equal split), and a saved draft turns
// NaN into null. Switching such a split to another type must render empty fields, not crash.
it.each<SplitType>(['exact', 'percentage', 'shares', 'adjustment'])('shows empty fields for stored null values in a %s split', (type) => {
  const stored: any = { type, entries: [{ member_id: 'bob', value: null }] };
  render(<SplitEditor members={members} totalAmount={30} value={stored} onChange={jest.fn()} />);
  expect(screen.getByLabelText(`${type} for Bob`).props.value).toBe('');
});

// Add expense starts an equal split as members without values. Switching type used to leave those fields blank, which
// the app counted as 0 but sent as "no value", and the server could not calculate.
describe.each([['Exact', 'exact', 0], ['Percent', 'percentage', 0], ['Adjust', 'adjustment', 0], ['Shares', 'shares', 1]])(
  'switching an equal split to %s', (tab, type, filled) => {
    it.each([['without values', undefined], ['with stored null values', null]])('gives everyone %s a value', (_case, blank) => {
      const onChange = jest.fn();
      const value: any = { type: 'equal', entries: [{ member_id: 'bob', value: blank }] };
      render(<SplitEditor members={members} totalAmount={30} value={value} onChange={onChange} />);
      fireEvent.press(screen.getByText(tab));
      expect(onChange).toHaveBeenLastCalledWith({ type, entries: [{ member_id: 'bob', value: filled }] });
    });
  });

it('keeps values already entered when the split type changes', () => {
  const onChange = jest.fn();
  render(<SplitEditor members={members} totalAmount={30} value={{ type: 'exact', entries: [{ member_id: 'bob', value: 12 }] }} onChange={onChange} />);
  fireEvent.press(screen.getByText('Adjust'));
  expect(onChange).toHaveBeenLastCalledWith({ type: 'adjustment', entries: [{ member_id: 'bob', value: 12 }] });
});
