import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import GroupsPage from './GroupsPage';
import * as api from '../api/groups';

jest.mock('heic2any', () => ({
  default: jest.fn(),
}), { virtual: true });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

test('renders the user\'s groups', async () => {
  jest.spyOn(api, 'listGroups').mockResolvedValue([
    { group_id: 'g1', name: 'Apartment 4B', group_type: 'home', member_count: 3, my_balance: 42.17, status: 'active', archived_at: null, deleted_at: null },
  ]);
  renderPage();
  await waitFor(() => screen.getByText(/Apartment 4B/));
  expect(screen.getByText(/Apartment 4B/)).toBeInTheDocument();
  // Groups redesign — left rail row shows a single lowercase "you're owed $X" line
  // instead of the old grid card's separate label + standalone amount typography.
  expect(screen.getByText(/you're owed \$42\.17/i)).toBeInTheDocument();
});

test('shows an empty state when the user has no groups', async () => {
  jest.spyOn(api, 'listGroups').mockResolvedValue([]);
  renderPage();
  // TS-GRP-122 split the list into Active/Archived tabs; the default (Active)
  // tab's empty state reads "No active groups yet".
  await waitFor(() => screen.getByText(/No active groups yet/));
  expect(screen.getByText(/No active groups yet/)).toBeInTheDocument();
});

test('shows a graceful message when groups are not yet enabled (404)', async () => {
  jest.spyOn(api, 'listGroups').mockRejectedValue(new api.ApiError('Not Found', 404, null));
  renderPage();
  await waitFor(() => screen.getByText(/isn't available yet/));
  expect(screen.getByText(/isn't available yet/)).toBeInTheDocument();
});
