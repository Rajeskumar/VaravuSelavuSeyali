import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import AddIcon from '@mui/icons-material/Add';
import { useTheme } from '@mui/material/styles';
import GroupAvatar from './GroupAvatar';
import SegmentedTabs from '../common/SegmentedTabs';
import { GroupSummary } from '../../api/groups';
import { tabularNums } from '../../theme';

type RailTab = 'active' | 'archived';

interface Props {
  groups: GroupSummary[];
  loading?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
}

/**
 * Persistent left rail (Splitwise/Gmail-style master-detail) — replaces the old grid-of-cards
 * GroupsPage. Only shown at md+; below that a group list still needs a full-width view, which
 * the shell handles by hiding the center/balances panes instead of squeezing all three in.
 */
const GroupsListRail: React.FC<Props> = ({ groups, loading, selectedId, onSelect, onCreate, tab, onTabChange }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        borderRight: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Groups
        </Typography>
        <IconButton size="small" onClick={onCreate} aria-label="Create group">
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ px: 2, pb: 1.5 }}>
        <SegmentedTabs<RailTab>
          value={tab}
          onChange={onTabChange}
          fullWidth
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {!loading && groups.length === 0 && (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {tab === 'active' ? 'No active groups yet.' : 'No archived groups.'}
            </Typography>
            {tab === 'active' && (
              <Button size="small" onClick={onCreate} sx={{ mt: 1 }}>
                Create one
              </Button>
            )}
          </Box>
        )}
        {groups.map((g) => {
          const selected = g.group_id === selectedId;
          const balanceLabel =
            g.my_balance > 0 ? `you're owed $${g.my_balance.toFixed(2)}` : g.my_balance < 0 ? `you owe $${Math.abs(g.my_balance).toFixed(2)}` : 'settled up';
          const balanceColor = g.my_balance > 0 ? theme.palette.success.main : g.my_balance < 0 ? theme.palette.error.main : theme.palette.text.secondary;
          return (
            <Box
              key={g.group_id}
              onClick={() => onSelect(g.group_id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: 2,
                py: 1,
                cursor: 'pointer',
                backgroundColor: selected ? theme.palette.action.selected : 'transparent',
                borderLeft: `3px solid ${selected ? theme.palette.primary.main : 'transparent'}`,
                '&:hover': { backgroundColor: selected ? theme.palette.action.selected : theme.palette.action.hover },
              }}
            >
              <GroupAvatar seed={g.group_id} groupType={g.group_type} size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {g.name}
                  </Typography>
                  {g.status === 'archived' && (
                    <Chip label="Archived" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: balanceColor, ...tabularNums }} noWrap>
                  {balanceLabel}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default GroupsListRail;
