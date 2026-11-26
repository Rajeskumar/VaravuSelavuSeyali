/** TS-FIX-101: with exact-to-the-cent checks, people must be able to type cents, and see what is left. */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SplitEditor, { SplitEditorValue, computeSplitValid, previewAdjustmentSplit, previewPercentageSplit } from './SplitEditor';
import PayerPicker from './PayerPicker';
import { PayerSummaryItem } from '../api/groups';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../core/theme/ThemeContext', () => ({
  useAppTheme: () => ({ theme: require('../../../core/theme/theme').lightTheme }),
}));

const members: any[] = ['a', 'b', 'c'].map((id) => ({ member_id: id, display_name: id.toUpperCase(), status: 'active', role: 'member' }));

function Split({ initial, amount = 10 }: { initial: SplitEditorValue; amount?: number }) {
  const [value, setValue] = React.useState(initial);
  return <SplitEditor members={members} totalAmount={amount} value={value} onChange={setValue} />;
}

const entries = (values: number[]) => values.map((value, i) => ({ member_id: 'abc'[i], value }));

/** Types one character at a time, as a keyboard does, onto whatever the field currently shows. */
function type(field: () => any, text: string) {
  fireEvent.changeText(field(), '');
  for (const char of text) fireEvent.changeText(field(), `${field().props.value}${char}`);
}

it('lets cents be typed into a split field, and stops at two decimals', () => {
  const view = render(<Split initial={{ type: 'exact', entries: entries([0, 0, 0]) }} />);
  const field = () => view.getByLabelText('exact for A');
  type(field, '3.345');
  expect(field().props.value).toBe('3.34');
});

it('lets cents be typed into a payer field', () => {
  function Payers() {
    const [payers, setPayers] = React.useState<PayerSummaryItem[]>(
      [{ member_id: 'a', amount_paid: 0 }, { member_id: 'b', amount_paid: 0 }]);
    return <PayerPicker amount={10} members={members} payers={payers} onChange={setPayers} />;
  }
  const view = render(<Payers />);
  const field = () => view.getByLabelText('Amount paid by A');
  type(field, '3.34');
  expect(field().props.value).toBe('3.34');
});

it('pre-fills a second payer with whole cents', () => {
  const onChange = jest.fn();
  const view = render(<PayerPicker amount={50.3} members={members}
    payers={[{ member_id: 'a', amount_paid: 20.1 }, { member_id: 'c', amount_paid: 0 }]} onChange={onChange} />);
  fireEvent(view.getByLabelText('Include B as payer'), 'valueChange', true);
  expect(onChange.mock.calls[0][0].find((p: PayerSummaryItem) => p.member_id === 'b').amount_paid).toBe(30.2);
});

it('says what is really left when a percentage split is short', () => {
  const view = render(<Split initial={{ type: 'percentage', entries: entries([33.33, 33.33, 33.33]) }} />);
  expect(view.getByText('0.01% left')).toBeTruthy();
  expect(view.queryByText('$0.00 left')).toBeNull();
});

it('previews the extra cent on the same person as the server', () => {
  expect(previewPercentageSplit(entries([33.33, 33.33, 33.34]), 10)).toEqual([3.33, 3.33, 3.34]);
});

// TS-FIX-101 AC-004: no minus values, so an adjustment no longer has to add up to zero.
it('does not take a minus sign in an adjustment field', () => {
  const view = render(<Split initial={{ type: 'adjustment', entries: entries([0, 0, 0]) }} />);
  const field = () => view.getByLabelText('adjustment for A');
  fireEvent.changeText(field(), '-');
  expect(field().props.value).toBe('0');
});

it('accepts positive adjustments up to the total, and nothing negative', () => {
  const valid = (values: number[]) => computeSplitValid({ type: 'adjustment', entries: entries(values) }, 30);
  expect([valid([6, 6, 0]), valid([30, 0, 0]), valid([30.01, 0, 0]), valid([5, -5, 0])]).toEqual([true, true, false, false]);
});

it('previews adjustments the way the server stores them', () => {
  expect(previewAdjustmentSplit(entries([6, 6, 0]), 30)).toEqual([12, 12, 6]);
  // The spare cent goes by member id, not to whoever is first in the list.
  expect(previewAdjustmentSplit([{ member_id: 'z', value: 0 }, { member_id: 'a', value: 0 }, { member_id: 'b', value: 0 }], 10))
    .toEqual([3.33, 3.34, 3.33]);
});

it.each(['exact', 'percentage', 'shares'] as const)('refuses a minus value in a %s split', (type) => {
  expect(computeSplitValid({ type, entries: entries([110, -10, 0]) }, 100)).toBe(false);
});

it('says why a too-large adjustment is refused, without claiming nothing is left', () => {
  const view = render(<Split initial={{ type: 'adjustment', entries: entries([20, 0, 0]) }} />);
  expect(view.getByText(/Adjustments can't add up to more than/)).toBeTruthy();
  expect(view.queryByText('$0.00 left')).toBeNull();
});
