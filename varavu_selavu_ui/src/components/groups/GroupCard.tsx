import React from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupAvatar from './GroupAvatar';
import { GroupSummary } from '../../api/groups';

interface GroupCardProps {
  group: GroupSummary;
  onClick: () => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, onClick }) => {
  const balanceLabel =
    group.my_balance > 0
      ? `You're owed $${group.my_balance.toFixed(2)}`
      : group.my_balance < 0
      ? `You owe $${Math.abs(group.my_balance).toFixed(2)}`
      : 'Settled up';
  const balanceColor = group.my_balance > 0 ? 'success' : group.my_balance < 0 ? 'error' : 'default';

  return (
    <Card>
      <CardActionArea onClick={onClick} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
          <GroupAvatar seed={group.group_id} groupType={group.group_type} size={52} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
              {group.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {group.member_count} member{group.member_count === 1 ? '' : 's'}
            </Typography>
          </Box>
          <ChevronRightRoundedIcon sx={{ color: 'text.disabled' }} />
        </Box>
        <Chip
          size="small"
          color={balanceColor as any}
          label={balanceLabel}
          sx={{ mt: 1.75, fontWeight: 600 }}
        />
      </CardActionArea>
    </Card>
  );
};

export default GroupCard;
