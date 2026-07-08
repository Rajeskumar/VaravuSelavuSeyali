import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemSplitBoard from './ItemSplitBoard';
import { MemberDTO, GroupExpenseItemEntry } from '../../api/groups';

describe('ItemSplitBoard', () => {
  const mockMembers: MemberDTO[] = [
    { member_id: 'm1', display_name: 'Alice', role: 'admin', status: 'active' },
    { member_id: 'm2', display_name: 'Bob', role: 'member', status: 'active' },
    { member_id: 'm3', display_name: 'Charlie', role: 'member', status: 'active' },
  ];

  const defaultItems: GroupExpenseItemEntry[] = [
    {
      line_no: 1,
      item_name: 'Coffee',
      line_total: 5.0,
      member_ratios: {},
    },
    {
      line_no: 2,
      item_name: 'Cake',
      line_total: 10.0,
      member_ratios: { m1: 1 },
    }
  ];

  it('renders items and unassigned warning', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();

    render(
      <ItemSplitBoard
        items={defaultItems}
        members={mockMembers}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('Cake')).toBeInTheDocument();
    
    // Coffee has no assignment, so warning should be present
    expect(screen.getByText('Item must be assigned to at least one person')).toBeInTheDocument();
    
    // Total is invalid
    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it('assigning multiple members splits ratios evenly by default', () => {
    const onChange = jest.fn();
    
    render(
      <ItemSplitBoard
        items={defaultItems}
        members={mockMembers}
        onChange={onChange}
      />
    );

    // Click Bob for the first item (Coffee). In testing, the chips have the member names.
    // There are two "Bob" chips (one for each item). We want the first one.
    const bobChips = screen.getAllByText('Bob');
    fireEvent.click(bobChips[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedItems = onChange.mock.calls[0][0];
    expect(updatedItems[0].member_ratios).toEqual({ m2: 1 });
  });

  it('shows valid message when all items are assigned', () => {
    const validItems: GroupExpenseItemEntry[] = [
      {
        line_no: 1,
        item_name: 'Coffee',
        line_total: 5.0,
        member_ratios: { m1: 1 },
      }
    ];

    render(
      <ItemSplitBoard
        items={validItems}
        members={mockMembers}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText('All items assigned ✓')).toBeInTheDocument();
  });
});
