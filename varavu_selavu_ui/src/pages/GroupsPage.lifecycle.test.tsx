import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import GroupsPage from './GroupsPage';
import { QuickCaptureProvider } from '../context/QuickCaptureContext';
import * as api from '../api/groups';
import * as authApi from '../api/auth';

jest.mock('heic2any', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('framer-motion', () => {
  const R = require('react');
  return { motion: { div: (p: any) => R.createElement('div', p) }, // eslint-disable-next-line testing-library/no-node-access
    AnimatePresence: (p: any) => R.createElement(R.Fragment, null, p.children) };
});
// The settle flow itself is covered by SettleUpDialog.test.tsx; here only what the page does
// once a settlement succeeds matters, so the dialog is a button that reports success.
jest.mock('../components/groups/SettleUpDialog', () => ({
  __esModule: true,
  default: ({ open, onSuccess }: any) => (open ? <button onClick={onSuccess}>mock-settle-success</button> : null),
}));

const GROUP = {
  group_id: 'g1', name: 'Trip', group_type: 'trip', currency: 'USD', member_count: 2, my_balance: 0,
  status: 'active', archived_at: null, deleted_at: null,
};
const detail = (members: any[]) => ({ ...GROUP, cover: null, simplify_debts: true, default_split: null, members });
const ME = { member_id: 'm1', display_name: 'Me', role: 'admin', status: 'active', user_email: 'me@x.com' };
const JAMIE = { member_id: 'm2', display_name: 'Jamie', role: 'member', status: 'invited', user_email: null, invite_pending: false };

function LocationProbe() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  localStorage.setItem('vs_user', 'me@x.com');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <QuickCaptureProvider>
          <LocationProbe />
          <Routes>
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<GroupsPage />} />
          </Routes>
        </QuickCaptureProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { qc, invalidate };
}

const invalidatedKeys = (spy: jest.SpyInstance) => spy.mock.calls.map((c: any[]) => (c[0]?.queryKey ?? []).join('/'));

function mockGroupData(members: any[], transfers: any[] = []) {
  jest.spyOn(api, 'listGroups').mockResolvedValue([GROUP] as any);
  jest.spyOn(api, 'getGroup').mockResolvedValue(detail(members) as any);
  jest.spyOn(api, 'listGroupExpenses').mockResolvedValue([] as any);
  jest.spyOn(api, 'getBalances').mockResolvedValue({
    group_id: 'g1', simplified: true, transfers,
    members: members.map((m) => ({ member_id: m.member_id, display_name: m.display_name, net: 0 })),
  } as any);
  jest.spyOn(authApi, 'fetchMe').mockResolvedValue({ email_verified: true } as any);
}

afterEach(() => jest.restoreAllMocks());

describe('unverified email', () => {
  test('the empty Groups screen asks to verify first instead of offering a form that will 403', async () => {
    jest.spyOn(api, 'listGroups').mockResolvedValue([]);
    jest.spyOn(authApi, 'fetchMe').mockResolvedValue({ email_verified: false } as any);
    renderAt('/groups');
    expect(await screen.findByText('Verify your email to start a group')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
  });

  test('a verified user still gets the Create Group action', async () => {
    jest.spyOn(api, 'listGroups').mockResolvedValue([]);
    jest.spyOn(authApi, 'fetchMe').mockResolvedValue({ email_verified: true } as any);
    renderAt('/groups');
    expect(await screen.findByText('No groups yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /create group/i }).length).toBeGreaterThan(0);
  });

  test('a 403 from the create call shows the verify prompt inside the dialog', async () => {
    jest.spyOn(api, 'listGroups').mockResolvedValue([]);
    jest.spyOn(authApi, 'fetchMe').mockResolvedValue({ email_verified: null } as any);
    jest.spyOn(api, 'createGroup').mockRejectedValue(new api.ApiError('Verify your email address before joining or creating groups.', 403, null));
    renderAt('/groups');
    fireEvent.click((await screen.findAllByRole('button', { name: /create group/i }))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/name/i), { target: { value: 'Flat' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
  });
});

describe('screens agree after a successful change', () => {
  test('creating a group puts it in the rail before navigating to it', async () => {
    // The rail refetch is awaited, so the new group's detail never appears next to
    // "No active groups yet" (LR-03).
    const created = { ...GROUP, group_id: 'g-new', name: 'Brand New' };
    const list = jest.spyOn(api, 'listGroups').mockResolvedValueOnce([]).mockResolvedValue([created] as any);
    jest.spyOn(authApi, 'fetchMe').mockResolvedValue({ email_verified: true } as any);
    jest.spyOn(api, 'createGroup').mockResolvedValue(created as any);
    jest.spyOn(api, 'getGroup').mockResolvedValue({ ...detail([ME]), group_id: 'g-new', name: 'Brand New' } as any);
    jest.spyOn(api, 'listGroupExpenses').mockResolvedValue([] as any);
    jest.spyOn(api, 'getBalances').mockResolvedValue({ group_id: 'g-new', simplified: true, transfers: [], members: [] } as any);
    renderAt('/groups');
    fireEvent.click((await screen.findAllByRole('button', { name: /create group/i }))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/name/i), { target: { value: 'Brand New' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/groups/g-new'));
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/No active groups yet/)).not.toBeInTheDocument();
    expect((await screen.findAllByText('Brand New')).length).toBeGreaterThan(0);
  });

  test('a successful settlement refreshes the group list, People tab and group detail', async () => {
    mockGroupData([ME, { ...JAMIE, status: 'active', user_email: 'jamie@x.com' }], [{ from_member_id: 'm2', to_member_id: 'm1', amount: 30 }]);
    const { invalidate } = renderAt('/groups/g1');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Settle up' }))[0]);
    fireEvent.click(await screen.findByText('mock-settle-success'));
    const keys = invalidatedKeys(invalidate);
    expect(keys).toEqual(expect.arrayContaining(['group-balances/g1', 'groups', 'friend-balances', 'group-expenses/g1']));
  });

  test('adding a member refreshes the detail, balances and the group list', async () => {
    mockGroupData([ME]);
    jest.spyOn(api, 'addMember').mockResolvedValue({ ...JAMIE } as any);
    const { invalidate } = renderAt('/groups/g1');
    fireEvent.click((await screen.findAllByRole('button', { name: /add member/i }))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Name only'));
    fireEvent.change(within(dialog).getByLabelText(/^name/i), { target: { value: 'Jamie' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^add/i }));
    await waitFor(() => expect(api.addMember).toHaveBeenCalledWith('g1', { display_name: 'Jamie' }));
    await waitFor(() => expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(['group/g1', 'group-balances/g1', 'groups'])));
  });
});

describe('group balances panel', () => {
  test('alone in a group it says what to do instead of "You\'re owed $0.00"', async () => {
    mockGroupData([ME]);
    renderAt('/groups/g1');
    expect(await screen.findByText('Add members to start splitting')).toBeInTheDocument();
    expect(screen.queryByText(/you're owed/i)).not.toBeInTheDocument();
  });

  test('with others and nothing owed it says settled up, and Balances starts collapsed', async () => {
    mockGroupData([ME, { ...JAMIE, status: 'active', user_email: 'jamie@x.com' }], []);
    renderAt('/groups/g1');
    expect((await screen.findAllByText("You're all settled up")).length).toBeGreaterThan(0);
    expect(screen.getByText('Everyone is settled up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Balances/ })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('pending chips', () => {
  test('a name-only member is not labelled pending; one with an open invite is', async () => {
    mockGroupData([
      ME,
      { ...JAMIE, member_id: 'm2', display_name: 'Guest', invite_pending: false },
      { ...JAMIE, member_id: 'm3', display_name: 'Invited', invite_pending: true },
    ]);
    renderAt('/groups/g1');
    expect(await screen.findByText('Invited · invite sent')).toBeInTheDocument();
    expect(screen.queryByText(/Guest · /)).not.toBeInTheDocument();
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });
});
