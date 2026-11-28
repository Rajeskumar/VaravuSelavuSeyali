import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PeopleList from './PeopleList';
import * as api from '../../api/groups';

// TS-FIX-104: the warning must stay on screen; the page's toast closes itself after a few seconds.
test('keeps a notice up when a payment had already been recorded', async () => {
  jest.spyOn(api, 'getFriendBalances').mockResolvedValue([
    { counterparty_email: 'bob@example.com', counterparty_display_name: 'Bob', net: 20, groups: [{ group_id: 'g1', name: 'Trip', net: 20 }] },
  ] as any);
  jest.spyOn(api, 'getGroup').mockResolvedValue({
    members: [{ member_id: 'me', user_email: 'ada@example.com' }, { member_id: 'b', user_email: 'bob@example.com' }],
  } as any);
  jest.spyOn(api, 'createSettlement').mockResolvedValue({ id: 's1', already_recorded: true } as any);
  window.localStorage.setItem('vs_user', 'ada@example.com');
  const onToast = jest.fn();
  render(<QueryClientProvider client={new QueryClient()}><PeopleList onToast={onToast} /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Bob'));
  fireEvent.click(await screen.findByRole('button', { name: /^record /i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/already recorded.*settle up once more/i);
  expect(onToast).not.toHaveBeenCalled();
});
