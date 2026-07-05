import React from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import { GroupSummary } from '../../api/groups';

const GROUP_TYPE_EMOJI: Record<string, string> = {
  trip: '✈️',
  home: '🏠',
  couple: '💑',
  other: '👥',
};

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
      <CardActionArea onClick={onClick}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {GROUP_TYPE_EMOJI[group.group_type] || '👥'} {group.name}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 1.5 }}>
            <PeopleAltRoundedIcon fontSize="small" />
            <Typography variant="body2">
              {group.member_count} member{group.member_count === 1 ? '' : 's'}
            </Typography>
          </Box>
          <Chip size="small" color={balanceColor as any} label={balanceLabel} />
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default GroupCard;
