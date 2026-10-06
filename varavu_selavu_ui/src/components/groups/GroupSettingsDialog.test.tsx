import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { GroupSettingsDialog } from './GroupSettingsDialog';
import * as api from '../../api/groups';

jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));

const ME = { member_id: 'm1', display_name: 'Me', role: 'admin', status: 'active', user_email: 'me@x.com' };
const members = [
  ME,
  { member_id: 'm2', display_name: 'Guest', role: 'member', status: 'invited', user_email: null, invite_pending: false },
  { member_id: 'm3', display_name: 'Invitee', role: 'member', status: 'invited', user_email: null, invite_pending: true },
];
const group = (over: any = {}): any => ({
  group_id: 'g1', name: 'Trip', group_type: 'trip', cover: null, currency: 'USD', simplify_debts: true,
  default_split: null, status: 'active', archived_at: null, deleted_at: null, members, ...over,
});

function setup(g = group()) {
  localStorage.setItem('vs_user', 'me@x.com');
  jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue({ muted: false } as any);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  const setToast = jest.fn();
  render(
    <QueryClientProvider client={qc}>
      <GroupSettingsDialog open onClose={jest.fn()} group={g} setToast={setToast} />
    </QueryClientProvider>,
  );
  return { invalidate, setToast };
}
const keys = (spy: jest.SpyInstance) => spy.mock.calls.map((c: any[]) => (c[0]?.queryKey ?? [])[0]);

afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); });

test('archiving refreshes the rail, balances, dashboard feeds and analysis — not just the open group', async () => {
  jest.spyOn(api, 'archiveGroup').mockResolvedValue();
  const { invalidate } = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive Group' }));
  // The confirm dialog's own button is named exactly "Archive" (the opener is "Archive Group").
  fireEvent.click(await screen.findByRole('button', { name: /^Archive$/ }));
  await waitFor(() => expect(api.archiveGroup).toHaveBeenCalledWith('g1'));
  await waitFor(() => expect(keys(invalidate)).toEqual(expect.arrayContaining(['group', 'groups', 'group-balances', 'friend-balances', 'all-group-expenses', 'analysis'])));
});

test('unarchiving refreshes the same set', async () => {
  jest.spyOn(api, 'unarchiveGroup').mockResolvedValue();
  const { invalidate } = setup(group({ status: 'archived' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Unarchive Group' }));
  await waitFor(() => expect(api.unarchiveGroup).toHaveBeenCalledWith('g1'));
  await waitFor(() => expect(keys(invalidate)).toEqual(expect.arrayContaining(['group', 'groups', 'friend-balances'])));
});

test('an untouched default-split form shows everyone ticked and no "Select at least one participant" error', async () => {
  setup();
  await screen.findByRole('button', { name: 'Archive Group' });
  expect(screen.queryByText('Select at least one participant')).not.toBeInTheDocument();
  for (const name of ['Me', 'Guest', 'Invitee']) {
    expect(screen.getByLabelText(`Include ${name}`)).toBeChecked();
  }
});

test('saving the untouched equal-for-everyone default stores "no default" so later members are included', async () => {
  const update = jest.spyOn(api, 'updateGroup').mockResolvedValue(group() as any);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: /^save/i }));
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(update.mock.calls[0][1]).toMatchObject({ default_split: null });
});

test('saving a deliberately narrower split keeps it', async () => {
  const update = jest.spyOn(api, 'updateGroup').mockResolvedValue(group() as any);
  setup();
  fireEvent.click(await screen.findByLabelText('Include Guest'));
  fireEvent.click(screen.getByRole('button', { name: /^save/i }));
  await waitFor(() => expect(update).toHaveBeenCalled());
  const split = (update.mock.calls[0][1] as any).default_split;
  expect(split.type).toBe('equal');
  expect(split.entries.map((e: any) => e.member_id).sort()).toEqual(['m1', 'm3']);
});

test('name-only seats read "Name only"; only a seat with an open invite reads "Invite sent"', async () => {
  setup();
  expect(await screen.findByText('Name only')).toBeInTheDocument();
  expect(screen.getByText('Invite sent')).toBeInTheDocument();
  expect(screen.queryByText(/hasn't joined/i)).not.toBeInTheDocument();
});

test('emailing an invite refreshes the group so the seat flips to "Invite sent"', async () => {
  jest.spyOn(api, 'createInvite').mockResolvedValue({ url: 'x', token: 't' } as any);
  const { invalidate } = setup();
  // Members render in order, so the first "Email invite" belongs to Guest (m2).
  fireEvent.click((await screen.findAllByRole('button', { name: /email invite/i }))[0]);
  fireEvent.change(await screen.findByLabelText('Their email'), { target: { value: 'g@x.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(api.createInvite).toHaveBeenCalledWith('g1', 'm2', 'g@x.com'));
  await waitFor(() => expect(keys(invalidate)).toContain('group'));
});
