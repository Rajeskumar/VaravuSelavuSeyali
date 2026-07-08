import React from 'react';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { useTheme } from '@mui/material/styles';
import { BalanceResponse } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';

interface BalanceListProps {
  balances: BalanceResponse;
  simplifyDebts?: boolean;
}

const BalanceList: React.FC<BalanceListProps> = ({ balances, simplifyDebts }) => {
  const theme = useTheme();
  const nameFor = (memberId: string) =>
    balances.members.find((m) => m.member_id === memberId)?.display_name || 'Unknown';
  const allSettled = balances.members.every((m) => m.net === 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {balances.members.map((m, idx) => {
          const label = m.net > 0 ? `is owed $${m.net.toFixed(2)}` : m.net < 0 ? `owes $${Math.abs(m.net).toFixed(2)}` : 'is settled up';
          const color = m.net > 0 ? theme.palette.success.main : m.net < 0 ? theme.palette.error.main : theme.palette.text.secondary;
          return (
            <Box
              key={m.member_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2.5,
                py: 1.75,
                borderTop: idx === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
              }}
            >
              <Avatar sx={{ width: 36, height: 36, fontSize: 14, bgcolor: colorFromMemberId(m.member_id) }}>
                {initialsFromName(m.display_name)}
              </Avatar>
              <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
                {m.display_name}
              </Typography>
              <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
                {label}
              </Typography>
            </Box>
          );
        })}
      </Paper>

      {balances.transfers.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Who owes whom
            </Typography>
            {simplifyDebts && (
              <Chip size="small" label="Simplified" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
            )}
          </Box>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            {balances.transfers.map((t, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.75,
                  borderTop: idx === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                }}
              >
                <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: colorFromMemberId(t.from_member_id) }}>
                  {initialsFromName(nameFor(t.from_member_id))}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {nameFor(t.from_member_id)}
                </Typography>
                <ArrowForwardRoundedIcon fontSize="small" sx={{ color: 'text.disabled', mx: 0.5 }} />
                <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: colorFromMemberId(t.to_member_id) }}>
                  {initialsFromName(nameFor(t.to_member_id))}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  {nameFor(t.to_member_id)}
                </Typography>
                <Chip size="small" label={`$${t.amount.toFixed(2)}`} sx={{ fontWeight: 700 }} />
              </Box>
            ))}
          </Paper>
        </Box>
      )}

      {allSettled && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center', py: 2, color: 'text.secondary' }}>
          <CheckCircleRoundedIcon fontSize="small" color="success" />
          <Typography variant="body2">Everyone is settled up.</Typography>
        </Box>
      )}
    </Box>
  );
};

export default BalanceList;
