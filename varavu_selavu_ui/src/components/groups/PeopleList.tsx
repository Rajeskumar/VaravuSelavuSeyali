import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { getFriendBalances, getGroup, createSettlement, FriendBalanceDTO } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import { formatMoney } from '../expenses/ExpenseFeed';
import { slate } from '../../theme';

interface PeopleListProps {
  onToast?: (message: string, severity: 'success' | 'error') => void;
}

/**
 * Groups → People tab (TrackSpense v3 Mobile design) — expandable per-person balance cards with
 * a one-tap "settle across every shared group" action. Supersedes the old read-only
 * FriendBalancesWidget, which had no expand/settle interaction.
 *
 * "Settle with this person across every shared group" has no batch API (`createSettlement` is
 * always single-group — see api/groups.ts) — this issues one `createSettlement` call per shared
 * group sequentially, resolving each side's `member_id` via that group's own member list (the
 * friend-balances payload only carries email/name, not per-group member ids). That means the
 * action is NOT atomic: a failure partway through leaves whichever groups already succeeded
 * settled and the rest unsettled. The toast after the attempt reports how many of the person's
 * groups actually settled so the user can see and retry a partial failure.
 */
const PeopleList: React.FC<PeopleListProps> = ({ onToast }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isDark = theme.palette.mode === 'dark';
  const positiveColor = isDark ? slate.positiveDark : slate.positive;
  const negativeColor = isDark ? slate.negativeDark : slate.negative;
  const myEmail = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  const { data, isLoading } = useQuery({ queryKey: ['friend-balances'], queryFn: getFriendBalances });
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const [settlingKey, setSettlingKey] = React.useState<string | null>(null);

  const keyFor = (p: FriendBalanceDTO) => p.counterparty_email || p.counterparty_display_name;

  const handleSettle = async (person: FriendBalanceDTO) => {
    const key = keyFor(person);
    setSettlingKey(key);
    const sharedGroups = person.groups.filter((g) => Math.abs(g.net) >= 0.005);
    let succeeded = 0;
    const failedGroupNames: string[] = [];

    for (const g of sharedGroups) {
      try {
        const detail = await getGroup(g.group_id);
        const me = detail.members.find((m) => m.user_email === myEmail);
        const them = detail.members.find((m) => m.user_email === person.counterparty_email);
        if (!me || !them) throw new Error('Could not resolve members for this group');
        // net > 0 means the counterparty owes the current user (FriendBalancesWidget's
        // confirmed sign convention for this same /friends/balances payload).
        const [from_member_id, to_member_id] = g.net > 0 ? [them.member_id, me.member_id] : [me.member_id, them.member_id];
        await createSettlement(g.group_id, { from_member_id, to_member_id, amount: Math.abs(g.net) });
        succeeded += 1;
        queryClient.invalidateQueries({ queryKey: ['group-balances', g.group_id] });
      } catch {
        failedGroupNames.push(g.name);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['friend-balances'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    setSettlingKey(null);

    if (failedGroupNames.length === 0) {
      onToast?.(
        `Settled up with ${person.counterparty_display_name} across ${sharedGroups.length} group${sharedGroups.length === 1 ? '' : 's'}.`,
        'success'
      );
    } else {
      onToast?.(
        `Settled ${succeeded}/${sharedGroups.length} groups with ${person.counterparty_display_name} — retry ${failedGroupNames.join(', ')}.`,
        'error'
      );
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No balances with people yet.</Typography>
      </Box>
    );
  }

  const owedTotal = data.filter((p) => p.net > 0).reduce((t, p) => t + p.net, 0);
  const oweTotal = data.filter((p) => p.net < 0).reduce((t, p) => t - p.net, 0);

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        <Box component="span" sx={{ color: positiveColor, fontWeight: 700 }}>{formatMoney(owedTotal)}</Box>{' '}
        <Box component="span" sx={{ color: 'text.secondary' }}>owed to you</Box>
        {' · '}
        <Box component="span" sx={{ color: negativeColor, fontWeight: 700 }}>{formatMoney(oweTotal)}</Box>{' '}
        <Box component="span" sx={{ color: 'text.secondary' }}>you owe</Box>
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {data.map((person) => {
          const key = keyFor(person);
          const expanded = expandedKey === key;
          const settled = Math.abs(person.net) < 0.005;
          const owesYou = person.net > 0;
          const settling = settlingKey === key;

          return (
            <Box key={key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
              <Box
                onClick={() => setExpandedKey(expanded ? null : key)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, cursor: 'pointer' }}
              >
                <Avatar sx={{ width: 38, height: 38, fontSize: 13, bgcolor: colorFromMemberId(key) }}>
                  {initialsFromName(person.counterparty_display_name)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>{person.counterparty_display_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {person.groups.length} group{person.groups.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: settled ? 'text.secondary' : owesYou ? positiveColor : negativeColor }}>
                    {settled ? '$0.00' : formatMoney(person.net)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settled ? 'settled' : owesYou ? 'owes you' : 'you owe'}
                  </Typography>
                </Box>
              </Box>

              {expanded && (
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: 1.75, py: 1.25, bgcolor: 'action.hover' }}>
                  {person.groups.map((g) => (
                    <Box key={g.group_id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, fontSize: 13 }}>
                      <Box component="span" sx={{ color: 'text.secondary' }}>{g.name}</Box>
                      <Box component="span" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: Math.abs(g.net) < 0.005 ? 'text.secondary' : g.net > 0 ? positiveColor : negativeColor }}>
                        {formatMoney(g.net)}
                      </Box>
                    </Box>
                  ))}
                  {!settled && (
                    <Button
                      fullWidth
                      variant="contained"
                      size="small"
                      disabled={settling}
                      onClick={() => handleSettle(person)}
                      sx={{ mt: 1.25, borderRadius: 999 }}
                    >
                      {settling ? 'Recording…' : `Record ${owesYou ? 'I paid' : `${person.counterparty_display_name.split(' ')[0]} paid`} ${formatMoney(Math.abs(person.net))}`}
                    </Button>
                  )}
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
                    One settlement clears every group with {person.counterparty_display_name.split(' ')[0]} — recorded per-group underneath.
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default PeopleList;
