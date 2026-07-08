import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { useTheme } from '@mui/material/styles';
import { getFriendBalances } from '../../api/groups';

/** TS-GRP-128: total owed to/from each person across every shared group. */
const FriendBalancesWidget: React.FC = () => {
  const theme = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ['friend-balances'], queryFn: getFriendBalances });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        Balances with people
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {data.map((b) => {
          const owesYou = b.net > 0;
          const color = owesYou ? theme.palette.success.main : theme.palette.error.main;
          const label = owesYou
            ? `${b.counterparty_display_name} owes you $${b.net.toFixed(2)}`
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
