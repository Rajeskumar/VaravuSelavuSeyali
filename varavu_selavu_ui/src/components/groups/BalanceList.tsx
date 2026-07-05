import React from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { BalanceResponse } from '../../api/groups';

interface BalanceListProps {
  balances: BalanceResponse;
}

const BalanceList: React.FC<BalanceListProps> = ({ balances }) => {
  const nameFor = (memberId: string) =>
    balances.members.find((m) => m.member_id === memberId)?.display_name || 'Unknown';

  return (
    <Box>
      <List disablePadding>
        {balances.members.map((m) => {
          const label = m.net > 0 ? `is owed $${m.net.toFixed(2)}` : m.net < 0 ? `owes $${Math.abs(m.net).toFixed(2)}` : 'is settled up';
          const color = m.net > 0 ? 'success.main' : m.net < 0 ? 'error.main' : 'text.secondary';
          return (
            <ListItem key={m.member_id} disableGutters>
              <ListItemText primary={m.display_name} secondary={label} secondaryTypographyProps={{ sx: { color } }} />
            </ListItem>
          );
        })}
      </List>

      {balances.transfers.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Who owes whom
          </Typography>
          <List disablePadding>
            {balances.transfers.map((t, idx) => (
              <ListItem key={idx} disableGutters>
                <ListItemText primary={`${nameFor(t.from_member_id)} owes ${nameFor(t.to_member_id)} $${t.amount.toFixed(2)}`} />
              </ListItem>
            ))}
          </List>
        </>
      )}

      {balances.members.every((m) => m.net === 0) && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Everyone is settled up.
        </Typography>
      )}
    </Box>
  );
};

export default BalanceList;
