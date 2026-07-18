import React from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useTheme } from '@mui/material/styles';
import GroupAvatar from './GroupAvatar';
import { GroupSummary } from '../../api/groups';
import { tabularNums } from '../../theme';

interface GroupCardProps {
  group: GroupSummary;
  onClick: () => void;
}

/**
 * TS-DES-206 — balance renders as standalone type (no chip/pill, no extra border), matching the
 * ticket's "large standalone type with no card border" requirement for the balance specifically.
 * The row itself stays a `Card` (flat hairline per the global TS-DES-201 theme, no shadow) since
 * `GroupSummary` (this list endpoint) only carries `member_count`, not actual member ids/names —
 * confirmed via `api/groups.ts`. A true per-member avatar stack (like `GroupDetailPage`'s, which
 * already has full `MemberDTO[]` from a different endpoint) isn't buildable here without an N+1
 * fetch per group card or a backend change to `GroupSummary`; documented as an open gap rather
 * than worked around with a fake/placeholder stack.
 */
const GroupCard: React.FC<GroupCardProps> = ({ group, onClick }) => {
  const theme = useTheme();
  const balanceLabel = group.my_balance > 0 ? "You're owed" : group.my_balance < 0 ? 'You owe' : 'Settled up';
  const balanceColor =
    group.my_balance > 0 ? theme.palette.success.main : group.my_balance < 0 ? theme.palette.error.main : theme.palette.text.secondary;

  return (
    <Card>
      <CardActionArea onClick={onClick} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, mb: 1.75 }}>
          <GroupAvatar seed={group.group_id} groupType={group.group_type} size={52} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                {group.name}
              </Typography>
              {group.status === 'archived' && (
                <Chip label="Archived" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {group.member_count} member{group.member_count === 1 ? '' : 's'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            {balanceLabel}
          </Typography>
          {group.my_balance !== 0 && (
            <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: balanceColor, ...tabularNums }}>
              ${Math.abs(group.my_balance).toFixed(2)}
            </Typography>
          )}
        </Box>
      </CardActionArea>
    </Card>
  );
};

export default GroupCard;
