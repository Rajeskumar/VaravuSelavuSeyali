import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SplitEditor, { SplitEditorValue, computeSplitValid } from './SplitEditor';
import PayerPicker, { computePayersValid } from './PayerPicker';
import { previewPercentageSplit } from '../../utils/splitPreview';
import { MemberDTO } from '../../api/groups';

const members: MemberDTO[] = [
  { member_id: 'a', display_name: 'Alice', role: 'admin', status: 'active' },
  { member_id: 'b', display_name: 'Bob', role: 'member', status: 'active' },
  { member_id: 'c', display_name: 'Carol', role: 'member', status: 'active' },
];

function Wrapper({ initial, amount = 90 }: { initial: SplitEditorValue; amount?: number }) {
  const [value, setValue] = React.useState(initial);
  const [valid, setValid] = React.useState(false);
  return (
    <div>
      <div data-testid="valid">{String(valid)}</div>
      <SplitEditor amount={amount} members={members} value={value} onChange={setValue} onValidityChange={setValid} />
    </div>
  );
}

test('equal split with all members selected shows correct rounding preview', () => {
  render(
    <Wrapper
      amount={90}
      initial={{ type: 'equal', entries: members.map((m) => ({ member_id: m.member_id })) }}
    />
  );
  expect(screen.getAllByText('$30.00')).toHaveLength(3);
  expect(screen.getByTestId('valid').textContent).toBe('true');
});

test('percentage split not totaling 100 shows an error and is invalid', () => {
  render(
    <Wrapper
      amount={100}
      initial={{
        type: 'percentage',
        entries: [
          { member_id: 'a', value: 50 },
          { member_id: 'b', value: 40 },
        ],
      }}
    />
  );
  expect(screen.getByText(/Percentages must total 100/)).toBeInTheDocument();
  expect(screen.getByTestId('valid').textContent).toBe('false');
});

test('percentage split totaling 100 is valid and previews rounded amounts', () => {
  render(
    <Wrapper
      amount={200}
      initial={{
        type: 'percentage',
        entries: [
          { member_id: 'a', value: 33.33 },
          { member_id: 'b', value: 33.33 },
          { member_id: 'c', value: 33.34 },
        ],
      }}
    />
  );
  expect(screen.getByText(/Split reconciles/)).toBeInTheDocument();
  expect(screen.getByTestId('valid').textContent).toBe('true');
  expect(screen.getByText('$66.68')).toBeInTheDocument();
});

test('exact split not totaling the expense amount shows an error and is invalid', () => {
  render(
    <Wrapper
      amount={90}
      initial={{
        type: 'exact',
        entries: [
          { member_id: 'a', value: 50 },
          { member_id: 'b', value: 50 },
        ],
      }}
    />
  );
  expect(screen.getByText(/Exact amounts must total \$90.00/)).toBeInTheDocument();
  expect(screen.getByTestId('valid').textContent).toBe('false');
});

test('unchecking a member removes them from the split', () => {
  render(
    <Wrapper
      amount={90}
      initial={{ type: 'equal', entries: members.map((m) => ({ member_id: m.member_id })) }}
    />
  );
  fireEvent.click(screen.getByLabelText('Include Carol'));
  expect(screen.getAllByText('$45.00')).toHaveLength(2);
});

test('shares split distributes amount proportionally', () => {
  render(
    <Wrapper
      amount={100}
      initial={{
        type: 'shares',
        entries: [
          { member_id: 'a', value: 1 },
          { member_id: 'b', value: 3 },
        ],
      }}
    />
  );
  expect(screen.getByText('$25.00')).toBeInTheDocument();
  expect(screen.getByText('$75.00')).toBeInTheDocument();
  expect(screen.getByTestId('valid').textContent).toBe('true');
});

test('adjustment split adjusts around equal base', () => {
  render(
    <Wrapper
      amount={100}
      initial={{
        type: 'adjustment',
        entries: [
          { member_id: 'a', value: 0 },
          { member_id: 'b', value: 20 },
        ],
      }}
    />
  );
  // Base = (100 - 20) / 2 = 40: Alice = 40, Bob = 40 + 20 = 60
  expect(screen.getByText('$40.00')).toBeInTheDocument();
  expect(screen.getByText('$60.00')).toBeInTheDocument();
  expect(screen.getByTestId('valid').textContent).toBe('true');
});

// TS-FIX-101: the server needs exact totals. Pre-filled values must add up, with each leftover
// cent given to a different, randomly chosen person.
describe('pre-filled Exact and Percentage values', () => {
  afterEach(() => jest.restoreAllMocks());

  function prefill(tab: 'Exact' | 'Percentage', amount: number): number[] {
    const view = render(
      <Wrapper amount={amount} initial={{ type: 'equal', entries: members.map((m) => ({ member_id: m.member_id })) }} />
    );
    fireEvent.click(screen.getByRole('button', { name: tab }));
    const cents = members.map((m) =>
      Math.round(Number((screen.getByLabelText(`${tab.toLowerCase()} for ${m.display_name}`) as HTMLInputElement).value) * 100)
    );
    expect(screen.getByTestId('valid').textContent).toBe('true');
    view.unmount();
    return cents;
  }

  test.each([
    ['Exact', 10, [333, 333, 334]],
    ['Exact', 100, [3333, 3333, 3334]],
    ['Exact', 20, [666, 667, 667]],
    ['Exact', 90, [3000, 3000, 3000]],
    ['Percentage', 100, [3333, 3333, 3334]],
  ] as const)('%s on %s adds up exactly', (tab, amount, expected) => {
    expect([...prefill(tab, amount)].sort((a, b) => a - b)).toEqual(expected);
  });

  test('who gets the extra cent is random', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const low = prefill('Exact', 10).indexOf(334);
    random.mockReturnValue(0.999999);
    const high = prefill('Exact', 10).indexOf(334);
    expect(low).not.toBe(high);
  });
});

describe('totals that are a cent out are refused, as the server refuses them', () => {
  const three = (value: number) => members.map((m) => ({ member_id: m.member_id, value }));

  test('exact and percentage', () => {
    expect(computeSplitValid({ type: 'exact', entries: three(33.33) }, 100)).toBe(false);
    expect(computeSplitValid({ type: 'percentage', entries: three(33.33) }, 100)).toBe(false);
    const adds = [33.33, 33.33, 33.34].map((value, i) => ({ member_id: members[i].member_id, value }));
    expect(computeSplitValid({ type: 'exact', entries: adds }, 100)).toBe(true);
    expect(computeSplitValid({ type: 'percentage', entries: adds }, 100)).toBe(true);
  });

  test('payers', () => {
    const paid = (amounts: number[]) => amounts.map((amount_paid, i) => ({ member_id: members[i].member_id, amount_paid }));
    expect(computePayersValid(paid([0.1, 0.2]), 0.31)).toBe(false);
    expect(computePayersValid(paid([5, 4.99]), 10)).toBe(false);
    expect(computePayersValid(paid([0.1, 0.2]), 0.3)).toBe(true);
  });
});

// TS-FIX-101 review findings.
describe('the preview puts the extra cent where the server will', () => {
  // Expected values come from services/split_engine.py: largest unrounded remainder, then member id.
  test.each([
    [10, [33.33, 33.33, 33.34], [3.33, 3.33, 3.34]],
    [10, [33.33, 33.34, 33.33], [3.33, 3.34, 3.33]],
    [80.4, [33.34, 33.33, 33.33], [26.8, 26.8, 26.8]],
  ])('%s split %j', (amount, percents, expected) => {
    const preview = previewPercentageSplit(amount, percents.map((value, i) => ({ member_id: 'abc'[i], value })));
    expect([preview.a, preview.b, preview.c]).toEqual(expected);
  });
});

describe('only values the server accepts', () => {
  test('a second payer is pre-filled with whole cents', () => {
    const onChange = jest.fn();
    render(<PayerPicker amount={50.3} members={members} payers={[{ member_id: 'a', amount_paid: 20.1 }, { member_id: 'c', amount_paid: 0 }]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Include Bob as payer'));
    expect(onChange.mock.calls[0][0].find((p: { member_id: string }) => p.member_id === 'b').amount_paid).toBe(30.2);
  });

  test('near-misses hidden past the sixth decimal are refused', () => {
    const entries = members.map((m) => ({ member_id: m.member_id, value: 33.333333 }));
    expect(computeSplitValid({ type: 'exact', entries }, 100)).toBe(false);
  });

  test('a third decimal cannot be typed into a split or payer field', () => {
    render(<Wrapper amount={100} initial={{ type: 'exact', entries: members.map((m) => ({ member_id: m.member_id, value: 1 })) }} />);
    const field = screen.getByLabelText('exact for Alice') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '33.33' } });
    fireEvent.change(field, { target: { value: '33.333' } });
    expect(field.value).toBe('33.33');
    const onChange = jest.fn();
    render(<PayerPicker amount={100} members={members} payers={[{ member_id: 'a', amount_paid: 1 }, { member_id: 'b', amount_paid: 1 }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Amount paid by Alice'), { target: { value: '33.333' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

test('a huge amount does not hang the pre-fill', () => {
  render(<Wrapper amount={1e100} initial={{ type: 'equal', entries: members.map((m) => ({ member_id: m.member_id })) }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Exact' }));
  expect(screen.getByLabelText('exact for Alice')).toBeInTheDocument();
});

describe('no minus values (TS-FIX-101 AC-004)', () => {
  const of = (values: number[]) => values.map((value, i) => ({ member_id: members[i].member_id, value }));

  test.each(['exact', 'percentage', 'shares', 'adjustment'] as const)('a %s split with a minus value is invalid', (type) => {
    expect(computeSplitValid({ type, entries: of([110, -10, 0]) }, 100)).toBe(false);
  });

  test('adjustments may use the whole total but not more', () => {
    expect(computeSplitValid({ type: 'adjustment', entries: of([60, 40, 0]) }, 100)).toBe(true);
    expect(computeSplitValid({ type: 'adjustment', entries: of([60, 40.01, 0]) }, 100)).toBe(false);
  });

  test('too large an adjustment says so instead of "reconciles"', () => {
    render(<Wrapper amount={10} initial={{ type: 'adjustment', entries: of([20, 0, 0]) }} />);
    expect(screen.getByText(/Adjustments can't add up to more than \$10\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Split reconciles/)).not.toBeInTheDocument();
    expect(screen.getByTestId('valid').textContent).toBe('false');
  });
});
