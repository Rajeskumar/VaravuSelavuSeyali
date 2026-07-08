import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SplitEditor, { SplitEditorValue } from './SplitEditor';
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
          { member_id: 'a', value: -10 },
          { member_id: 'b', value: 10 },
        ],
      }}
    />
  );
  // Base = 100 - 0 (total adjustments) = 100
  // Equal base = 50
  // Alice = 50 - 10 = 40
  // Bob = 50 + 10 = 60
  expect(screen.getByText('$40.00')).toBeInTheDocument();
  expect(screen.getByText('$60.00')).toBeInTheDocument();
  expect(screen.getByTestId('valid').textContent).toBe('true');
});
