import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyGroupsStrip from './MyGroupsStrip';

const groups: any[] = [
  { group_id: 'g1', name: 'Trip', group_type: 'trip', member_count: 3, currency: 'USD' },
  { group_id: 'g2', name: 'Flat', group_type: 'home', member_count: 2, currency: 'USD' },
];

it('shows each group as a real link, so keyboard users can open it', () => {
  render(<MemoryRouter><MyGroupsStrip groups={groups} groupSummaries={[]} /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Trip/ })).toHaveAttribute('href', '/groups/g1');
  expect(screen.getByRole('link', { name: /Flat/ })).toHaveAttribute('href', '/groups/g2');
});
