import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import SettleUpDialog from './SettleUpDialog';
import * as api from '../../api/groups';

const members = [
  { member_id: 'a', display_name: 'Alice', net: 40 },
  { member_id: 'b', display_name: 'Bob', net: -40 },
];

test('submitting records a settlement with the defaulted debtor/creditor and refreshes', async () => {
  const createSpy = jest.spyOn(api, 'createSettlement').mockResolvedValue({
    id: 's1',
    group_id: 'g1',
    from_member_id: 'b',
    to_member_id: 'a',
    amount: 40,
    settled_at: '2026-01-01T00:00:00Z',
  });
  const onSuccess = jest.fn();
  const onClose = jest.fn();

  render(<SettleUpDialog open groupId="g1" members={members} onClose={onClose} onSuccess={onSuccess} />);

  fireEvent.click(screen.getByRole('button', { name: /record settlement/i }));

  await waitFor(() => expect(createSpy).toHaveBeenCalledWith('g1', {
    from_member_id: 'b',
    to_member_id: 'a',
    amount: 40,
    method: 'cash',
    notes: undefined,
  }));
  expect(onSuccess).toHaveBeenCalled();

  // TS-DES-104: the dialog no longer auto-closes on success — it runs a count-to-zero
  // animation into a "done" resolution screen, and onClose only fires once the user
  // taps "Done" there (docs/design/prototypes/SettleUp.jsx's stage flow).
  expect(onClose).not.toHaveBeenCalled();
  const doneButton = await screen.findByRole('button', { name: /done/i }, { timeout: 2000 });
  expect(await screen.findByText('All squared up')).toBeInTheDocument();
  fireEvent.click(doneButton);
  expect(onClose).toHaveBeenCalled();
});

test('shows the backend error message when the request fails', async () => {
  jest.spyOn(api, 'createSettlement').mockRejectedValue(new api.ApiError('from_member_id and to_member_id must differ', 400, null));

  render(<SettleUpDialog open groupId="g1" members={members} onClose={jest.fn()} onSuccess={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /record settlement/i }));

  expect(await screen.findByText('from_member_id and to_member_id must differ')).toBeInTheDocument();
});
