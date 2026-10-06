import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import { BalanceTransfer, MemberBalance } from '../../api/groups';
import { typeScale, tabularNums } from '../../theme';
import { formatMoney } from '../../utils/money';

interface Props {
  members: MemberBalance[];
  /** The group's settle-up transfers — the per-person figures here come from these so they
   * always match what Settle up offers. */
  transfers: BalanceTransfer[];
  myMemberId?: string;
  onSettleUp: () => void;
  disabled?: boolean;
  currency?: string;
  /** Opens Add member — offered instead of Settle up while you're the only member. */
  onAddMember?: () => void;
}

/**
 * TS-DES-206 — desktop-only right-side balances panel (280px), consuming the app shell
 * TS-DES-210 built. Matches `desktop/DesktopGroupLayout.jsx`'s `BalancesPanel`: a standalone
 * (no card border) net-total number up top, then a per-member balance list, then a Settle Up
 * button. Only rendered at `lg+` — GroupDetailPage's own centered mobile/tablet-width hero
 * balance (also standalone, no border) covers every narrower width, so the two never both show.
 */
const GroupBalancesPanel: React.FC<Props> = ({ members, transfers, myMemberId, onSettleUp, disabled, currency = 'USD', onAddMember }) => {
  const theme = useTheme();
  const positiveColor = theme.palette.success.main;
  const negativeColor = theme.palette.error.main;
  const myNet = members.find((m) => m.member_id === myMemberId)?.net ?? 0;
  // What each person owes *you* (positive) or you owe them (negative). A member's own `net` is
  // their balance with the whole group, which isn't the same thing once three or more people
  // share expenses — showing it as "owes you" made this panel disagree with Settle up.
  const withMe = (memberId: string) =>
    transfers.reduce((sum, t) => {
      if (t.from_member_id === memberId && t.to_member_id === myMemberId) return sum + t.amount;
      if (t.from_member_id === myMemberId && t.to_member_id === memberId) return sum - t.amount;
      return sum;
    }, 0);

  // Alone in the group there's nothing to be owed — "You're owed $0.00" read like a broken number.
  const solo = members.filter((m) => m.member_id !== myMemberId).length === 0;
  const settledUp = Math.abs(myNet) < 0.005;

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
        {solo ? (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: 16, textAlign: 'center' }}>Add members to start splitting</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 0.75 }}>
              Balances show up here once someone else shares an expense.
            </Typography>
          </>
        ) : settledUp ? (
          <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>You're all settled up</Typography>
        ) : (
          <>
            <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>
              {myNet > 0 ? "You're owed" : 'You owe'}
            </Typography>
            <Typography component="div" sx={{ ...typeScale.display, ...tabularNums, color: myNet > 0 ? positiveColor : negativeColor, mt: 0.5 }}>
              {formatMoney(myNet, currency)}
            </Typography>
          </>
        )}
      </Box>

      <Box sx={{ px: 3, py: 2.5, flex: 1, overflowY: 'auto' }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>Balances</Typography>
        {members.filter(m => m.member_id !== myMemberId).map((m) => {
          const amount = withMe(m.member_id);
          const settled = Math.abs(amount) < 0.005;
          return (
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
                  {settled ? 'settled with you' : amount > 0 ? 'owes you' : 'you owe'}
                </Typography>
              </Box>
              {!settled && (
                <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem', ...tabularNums, color: amount > 0 ? positiveColor : negativeColor }}>
                  {amount > 0 ? '+' : '−'}{formatMoney(amount, currency)}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <Box sx={{ px: 3, pb: 4 }}>
        {solo && onAddMember ? (
          <Button fullWidth variant="contained" size="large" onClick={onAddMember}>
            Add member
          </Button>
        ) : (
          <Button fullWidth variant="contained" size="large" onClick={onSettleUp} disabled={disabled || solo}>
            Settle up
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default GroupBalancesPanel;
