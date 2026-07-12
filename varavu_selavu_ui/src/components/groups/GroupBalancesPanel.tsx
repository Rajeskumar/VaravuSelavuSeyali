import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import { MemberBalance } from '../../api/groups';
import { typeScale, tabularNums } from '../../theme';

interface Props {
  members: MemberBalance[];
  myMemberId?: string;
  onSettleUp: () => void;
  disabled?: boolean;
}

/**
 * TS-DES-206 — desktop-only right-side balances panel (280px), consuming the app shell
 * TS-DES-210 built. Matches `desktop/DesktopGroupLayout.jsx`'s `BalancesPanel`: a standalone
 * (no card border) net-total number up top, then a per-member balance list, then a Settle Up
 * button. Only rendered at `lg+` — GroupDetailPage's own centered mobile/tablet-width hero
 * balance (also standalone, no border) covers every narrower width, so the two never both show.
 */
const GroupBalancesPanel: React.FC<Props> = ({ members, myMemberId, onSettleUp, disabled }) => {
  const theme = useTheme();
  const positiveColor = theme.palette.success.main;
  const negativeColor = theme.palette.error.main;
  const myNet = members.find((m) => m.member_id === myMemberId)?.net ?? 0;

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        borderLeft: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      <Box sx={{ px: 3, pt: 4, pb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>
          {myNet >= 0 ? "You're owed" : 'You owe'}
        </Typography>
        <Typography component="div" sx={{ ...typeScale.display, ...tabularNums, color: myNet >= 0 ? positiveColor : negativeColor, mt: 0.5 }}>
          ${Math.abs(myNet).toFixed(2)}
        </Typography>
      </Box>

      <Box sx={{ px: 3, py: 2.5, flex: 1, overflowY: 'auto' }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>Balances</Typography>
        {members.filter(m => m.member_id !== myMemberId).map((m) => (
          <Box
            key={m.member_id}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: colorFromMemberId(m.member_id) }}>
              {initialsFromName(m.display_name)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem' }} noWrap>
                {m.display_name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }}>
                {m.net > 0 ? 'you owe' : 'owes you'}
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem', ...tabularNums, color: m.net > 0 ? negativeColor : positiveColor }}>
              {m.net > 0 ? '−' : '+'}${Math.abs(m.net).toFixed(2)}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 3, pb: 4 }}>
        <Button fullWidth variant="contained" size="large" onClick={onSettleUp} disabled={disabled}>
          Settle up
        </Button>
      </Box>
    </Box>
  );
};

export default GroupBalancesPanel;
