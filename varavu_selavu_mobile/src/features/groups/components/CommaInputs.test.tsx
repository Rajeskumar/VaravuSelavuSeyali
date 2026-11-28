/** A rejected comma used to leave the digits after it to be appended: "2,50" became 250 (TS-FIX-103, AC-009). */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SplitEditor, { SplitEditorValue, SplitType } from './SplitEditor';
import PayerPicker from './PayerPicker';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});

const members: any = [{ member_id: 'bob', display_name: 'Bob', status: 'active' }];

/** Types one character at a time onto whatever the field shows, as a keyboard does. */
const typeKeys = (label: string, keys: string) => {
  for (const key of keys) {
    const field = screen.getByLabelText(label);
    fireEvent.changeText(field, `${field.props.value}${key}`);
  }
};

describe('comma decimals in split and payer fields', () => {
  it.each<SplitType>(['exact', 'percentage', 'shares', 'adjustment'])('reads 2,50 as 2.5 in a %s split', (type) => {
    const seen = jest.fn();
    const Host = () => {
      const [value, setValue] = useState<SplitEditorValue>({ type, entries: [{ member_id: 'bob' }] });
      return <SplitEditor members={members} totalAmount={300} value={value} onChange={(v) => { seen(v); setValue(v); }} />;
    };
    render(<Host />);
    fireEvent.changeText(screen.getByLabelText(`${type} for Bob`), '');
    typeKeys(`${type} for Bob`, '2,50');
    expect(seen.mock.lastCall[0].entries[0].value).toBe(2.5);
  });

  it('reads 20,50 as 20.5 for a payer', () => {
    const seen = jest.fn();
    const Host = () => {
      const [payers, setPayers] = useState([{ member_id: 'bob', amount_paid: 0 }]);
      return <PayerPicker members={members} amount={300} payers={payers} onChange={(p) => { seen(p); setPayers(p as any); }} />;
    };
    render(<Host />);
    fireEvent.changeText(screen.getByLabelText('Amount paid by Bob'), '');
    typeKeys('Amount paid by Bob', '20,50');
    expect(seen.mock.lastCall[0][0].amount_paid).toBe(20.5);
  });
});
