import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { getFriendBalances } from '../../api/groups';

/** TS-GRP-128: total owed to/from each person across every shared group. */
const FriendBalancesWidget: React.FC = () => {
  const { data, isLoading } = useQuery({ queryKey: ['friend-balances'], queryFn: getFriendBalances });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <Paper sx={{ p: 2.5, mb: 3, borderRadius: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        Balances with people
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {data.map((b) => {
          // Backend convention (friend_balance_service.py): `net` accumulates +amount when a
          // transfer's `to_id` is the current user (someone owes them) and -amount when its
          // `from_id` is the current user (they owe someone) — so net > 0 means the counterparty
          // owes the current user. A prior fix pass flipped this to `net < 0` while correcting
          // the per-group GroupBalancesPanel (a separate component with its own, differently-
          // signed `net` field) and applied the same flip here by analogy without checking this
          // widget's own data source — verified against a live `/friends/balances` response
          // (Alice/Bob both `net: 100.0` while genuinely owing the current user) that this
          // widget's correct condition is `net > 0`, not `net < 0`.
          const owesYou = b.net > 0;
          const label = owesYou
            ? `${b.counterparty_display_name} owes you $${Math.abs(b.net).toFixed(2)}`
            : `You owe ${b.counterparty_display_name} $${Math.abs(b.net).toFixed(2)}`;
          return (
            <Box
              key={b.counterparty_email || b.counterparty_display_name}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
            >
              <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>
                {b.counterparty_display_name.slice(0, 1).toUpperCase()}
              </Avatar>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {b.groups.length} group{b.groups.length === 1 ? '' : 's'}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

export default FriendBalancesWidget;
