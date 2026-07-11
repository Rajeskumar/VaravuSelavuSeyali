import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PayerPicker from './PayerPicker';
import { MemberDTO } from '../../api/groups';

describe('PayerPicker', () => {
  const mockMembers: MemberDTO[] = [
    { member_id: 'm1', display_name: 'Alice', role: 'admin', status: 'active' },
    { member_id: 'm2', display_name: 'Bob', role: 'member', status: 'active' },
  ];

  it('defaults to a single-select list and marks the current payer valid', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();

    render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: 'm1', amount_paid: 100 }]}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    expect(screen.getByText('Multiple people')).toBeInTheDocument();
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it('selecting a different person pays them the full amount', () => {
    const onChange = jest.fn();

    render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: 'm1', amount_paid: 100 }]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Bob'));

    expect(onChange).toHaveBeenCalledWith([{ member_id: 'm2', amount_paid: 100 }]);
  });

  it('"Multiple people" switches to the per-person checkbox editor', () => {
    const onChange = jest.fn();

    render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: 'm1', amount_paid: 60 }]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Multiple people'));

    // Alice is checked (index 0), Bob is unchecked (index 1)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    expect(onChange).toHaveBeenCalledWith([
      { member_id: 'm1', amount_paid: 60 },
      { member_id: 'm2', amount_paid: 40 }, // 100 - 60 = 40
    ]);
  });

  it('shows an error in multiple-people mode when amounts do not match total', () => {
    render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[
          { member_id: 'm1', amount_paid: 50 },
          { member_id: 'm2', amount_paid: 30 },
        ]}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText('Amounts paid must equal total expense ($100.00). Currently: $80.00.')).toBeInTheDocument();
  });
});
