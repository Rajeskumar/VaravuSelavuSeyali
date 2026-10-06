import React, { useState } from 'react';
import { Box, Typography, Avatar, Paper, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getGroupActivity, GroupDetailResponse, GroupActivityDTO } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import PersonRemoveRoundedIcon from '@mui/icons-material/PersonRemoveRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import { formatMoney } from '../../utils/money';

interface ActivityFeedProps {
  groupId: string;
  group: GroupDetailResponse;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ groupId, group }) => {
  const [limit] = useState(50);
  const { data, isLoading, error } = useQuery({
    queryKey: ['group-activity', groupId, limit],
    queryFn: () => getGroupActivity(groupId, limit, 0),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">Failed to load activity.</Typography>
      </Box>
    );
  }

  if (data.items.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
        <HistoryRoundedIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography>No activity yet.</Typography>
      </Box>
    );
  }

  const meEmail = (localStorage.getItem('vs_user') || '').toLowerCase();
  const memberFor = (memberId: string | null | undefined) => group.members.find((m) => m.member_id === memberId);
  const isMe = (memberId: string | null | undefined) => !!meEmail && memberFor(memberId)?.user_email?.toLowerCase() === meEmail;
  const nameFor = (memberId: string | null) => {
    if (!memberId) return 'Someone';
    return memberFor(memberId)?.display_name || 'A member';
  };
  /** "You"/"you" for the viewer, the member's name otherwise. */
  const who = (memberId: string | null | undefined, subject: boolean) =>
    isMe(memberId) ? (subject ? 'You' : 'you') : nameFor(memberId ?? null);

  const getActionInfo = (item: GroupActivityDTO) => {
    const p = item.payload || {};
    const actor = who(item.actor_member_id, true);
    
    switch (item.action) {
      case 'group_created':
        return { icon: <AddCircleOutlineRoundedIcon color="primary" />, text: `${actor} created the group.` };
      case 'group_updated':
        return { icon: <SettingsRoundedIcon color="action" />, text: `${actor} updated the group settings.` };
      case 'expense_created':
      case 'itemized_expense_created':
        return { icon: <ReceiptLongRoundedIcon color="info" />, text: `${actor} added an expense: "${p.description}" for ${formatMoney(p.amount || 0, group.currency)}.` };
      case 'expense_updated':
        return { icon: <ReceiptLongRoundedIcon color="warning" />, text: `${actor} updated the expense "${p.description}".` };
      case 'expense_deleted':
        return { icon: <ReceiptLongRoundedIcon color="error" />, text: `${actor} deleted the expense "${p.description}".` };
      // A name-only seat never "joined" — someone added it. Only an accepted invite is a join.
      case 'member_added':
        return { icon: <PersonAddAlt1RoundedIcon color="success" />, text: `${actor} added ${p.display_name}.` };
      case 'member_joined':
        return { icon: <PersonAddAlt1RoundedIcon color="success" />, text: `${p.display_name} joined the group.` };
      case 'member_removed':
      case 'member_left':
        return { icon: <PersonRemoveRoundedIcon color="error" />, text: `${p.display_name} left the group.` };
      case 'settlement_created':
        if (p.from_member_id && p.to_member_id) {
          const recordedBy = p.from_member_id === item.actor_member_id || p.to_member_id === item.actor_member_id
            ? '' : ` (recorded by ${who(item.actor_member_id, false)})`;
          return { icon: <HandshakeRoundedIcon color="success" />, text: `${who(p.from_member_id, true)} paid ${who(p.to_member_id, false)} ${formatMoney(p.amount || 0, group.currency)}${recordedBy}.` };
        }
        return { icon: <HandshakeRoundedIcon color="success" />, text: `${actor} recorded a settlement of ${formatMoney(p.amount || 0, group.currency)}.` };
      case 'settlement_deleted':
        return { icon: <HandshakeRoundedIcon color="action" />, text: `${actor} deleted a settlement.` };
      default:
        return { icon: <HistoryRoundedIcon color="action" />, text: `${actor} performed an action.` };
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {data.items.map((item) => {
        const { icon, text } = getActionInfo(item);
        const date = new Date(item.created_at);
        const isToday = new Date().toDateString() === date.toDateString();
        const timeStr = isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        return (
          <Paper key={item.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderRadius: 1 }}>
            <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'background.default', display: 'flex' }}>
              {icon}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{text}</Typography>
              <Typography variant="caption" color="text.secondary">{timeStr}</Typography>
            </Box>
            {item.actor_member_id && (
              <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: colorFromMemberId(item.actor_member_id) }}>
                {initialsFromName(nameFor(item.actor_member_id))}
              </Avatar>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};
