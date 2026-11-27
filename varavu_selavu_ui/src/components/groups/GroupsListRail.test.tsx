import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupsListRail from './GroupsListRail';
import { GroupSummary } from '../../api/groups';

const group = (id: string, name: string): GroupSummary => ({
  group_id: id, name, group_type: 'trip', currency: 'USD', member_count: 2,
  my_balance: 0, status: 'active', archived_at: null, deleted_at: null,
});

describe('GroupsListRail', () => {
  it('renders each group as a keyboard-operable button and marks the selected one', async () => {
    const onSelect = jest.fn();
    render(
      <GroupsListRail
        groups={[group('g1', 'Goa trip'), group('g2', 'Flat')]}
        selectedId="g2"
        onSelect={onSelect}
        onCreate={jest.fn()}
        tab="active"
        onTabChange={jest.fn()}
      />,
    );
    const goa = screen.getByRole('button', { name: /Goa trip/ });
    expect(screen.getByRole('button', { name: /Flat/ })).toHaveAttribute('aria-current', 'page');
    expect(goa).not.toHaveAttribute('aria-current');

    goa.focus();
    expect(goa).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('g1');
  });
});
