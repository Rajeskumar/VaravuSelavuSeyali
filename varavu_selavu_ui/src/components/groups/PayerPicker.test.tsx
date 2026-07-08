import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PayerPicker from './PayerPicker';
import { MemberDTO } from '../../api/groups';

describe('PayerPicker', () => {
  const mockMembers: MemberDTO[] = [
    { member_id: 'm1', display_name: 'Alice', role: 'admin', status: 'active' },
    { member_id: 'm2', display_name: 'Bob', role: 'member', status: 'active' },
  ];

  it('renders and validates amounts', () => {
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

    expect(screen.getByText('Payments reconcile ✓')).toBeInTheDocument();
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it('shows error when amounts do not match total', () => {
    const onChange = jest.fn();
    
    render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: 'm1', amount_paid: 50 }]}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Amounts paid must equal total expense ($100.00). Currently: $50.00.')).toBeInTheDocument();
  });

  it('auto-fills remaining amount when adding a payer', () => {
    const onChange = jest.fn();
    
    render(
      <PayerPicker
        amount={100}
        members={mockMembers}
        payers={[{ member_id: 'm1', amount_paid: 60 }]}
        onChange={onChange}
      />
    );

    // Click Bob's checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    // Alice is checked (index 0), Bob is unchecked (index 1)
    fireEvent.click(checkboxes[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { member_id: 'm1', amount_paid: 60 },
      { member_id: 'm2', amount_paid: 40 }, // 100 - 60 = 40
    ]);
  });
});
