import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ActivityFeed } from './ActivityFeed';
import * as api from '../../api/groups';

const group: any = {
  group_id: 'g1', name: 'Flat', currency: 'USD',
  members: [
    { member_id: 'me', display_name: 'Rajesh', role: 'admin', status: 'active', user_email: 'me@x.com' },
    { member_id: 'alex', display_name: 'Alex Test', role: 'member', status: 'invited', user_email: null },
    { member_id: 'bea', display_name: 'Bea Test', role: 'member', status: 'active', user_email: 'bea@x.com' },
  ],
};

function feed(items: any[]) {
  jest.spyOn(api, 'getGroupActivity').mockResolvedValue({ items, total: items.length } as any);
  localStorage.setItem('vs_user', 'me@x.com');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><ActivityFeed groupId="g1" group={group} /></QueryClientProvider>);
}
const item = (action: string, actor: string | null, payload: any = {}) => ({ id: `${action}-${Math.random()}`, action, actor_member_id: actor, entity_id: null, payload, created_at: '2026-10-05T10:00:00Z' });

afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); });

test('a name-only seat is "added by you", never "joined"', async () => {
  feed([item('member_added', 'me', { display_name: 'Alex Test', user_email: null })]);
  expect(await screen.findByText('You added Alex Test.')).toBeInTheDocument();
  expect(screen.queryByText(/joined/i)).not.toBeInTheDocument();
});

test('an accepted invite is "joined the group"', async () => {
  feed([item('member_joined', 'bea', { display_name: 'Bea Test' })]);
  expect(await screen.findByText('Bea Test joined the group.')).toBeInTheDocument();
});

test('a settlement says who paid whom, with "you" for the viewer', async () => {
  feed([item('settlement_created', 'me', { amount: 10, from_member_id: 'alex', to_member_id: 'me' })]);
  expect(await screen.findByText('Alex Test paid you $10.00.')).toBeInTheDocument();
});

test('a settlement recorded on behalf of two other people names the recorder', async () => {
  feed([item('settlement_created', 'me', { amount: 5, from_member_id: 'alex', to_member_id: 'bea' })]);
  expect(await screen.findByText('Alex Test paid Bea Test $5.00 (recorded by you).')).toBeInTheDocument();
});

test('older settlements without member ids keep the generic wording', async () => {
  feed([item('settlement_created', 'bea', { amount: 7 })]);
  expect(await screen.findByText('Bea Test recorded a settlement of $7.00.')).toBeInTheDocument();
});

test('the viewer is "You" for their own actions', async () => {
  feed([item('expense_created', 'me', { description: 'Pizza', amount: 20 })]);
  expect(await screen.findByText(/^You added an expense: "Pizza" for \$20\.00\.$/)).toBeInTheDocument();
});
