import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import AddIcon from '@mui/icons-material/Add';
import { useTheme } from '@mui/material/styles';
import GroupAvatar from './GroupAvatar';
import SegmentedTabs from '../common/SegmentedTabs';
import { GroupSummary } from '../../api/groups';
import { tabularNums } from '../../theme';
import { balanceDirection, formatBalanceAmount } from '../../utils/balance';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import EmptyState from '../common/EmptyState';

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
 * Persistent left rail (Splitwise/Gmail-style master-detail) at md+. Below md the shell hides
 * the center/balances panes and this rail IS the page — so it must be full width there. It
 * used to stay a fixed 280px with its own right border inside a 100%-wide wrapper, leaving an
 * empty strip on phones and most of the panel blank on tablets (design review 2026-09, UI-03).
 */
const GroupsListRail: React.FC<Props> = ({ groups, loading, selectedId, onSelect, onCreate, tab, onTabChange }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: { xs: '100%', md: 280 },
        flexShrink: 0,
        borderRight: { xs: 'none', md: `1px solid ${theme.palette.divider}` },
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
        {!loading && groups.length === 0 && tab === 'archived' && (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No archived groups.</Typography>
          </Box>
        )}
        {!loading && groups.length === 0 && tab === 'active' && (
          <>
            {/* md+: the center pane already carries the full explanation + CTA, so the rail
                stays terse (two competing empty states was its own review finding). Below md
                the rail is the whole page, so it gets the real first-use guidance. */}
            <Box sx={{ display: { xs: 'none', md: 'block' }, px: 2, py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">No active groups yet.</Typography>
            </Box>
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              <EmptyState
                icon={<GroupsRoundedIcon />}
                title="No groups yet"
                description="Create a group to split rent, trips, or shared bills with roommates and friends. Your share of every group expense joins your personal total automatically."
                actionLabel="Create group"
                onAction={onCreate}
              />
            </Box>
          </>
        )}
        {groups.map((g) => {
          const selected = g.group_id === selectedId;
          const direction = balanceDirection(g.my_balance);
          const balanceLabel =
            direction === 'owed'
              ? `you're owed ${formatBalanceAmount(g.my_balance, g.currency)}`
              : direction === 'owes'
                ? `you owe ${formatBalanceAmount(g.my_balance, g.currency)}`
                : 'settled up';
          const balanceColor =
            direction === 'owed'
              ? theme.palette.success.main
              : direction === 'owes'
                ? theme.palette.error.main
                : theme.palette.text.secondary;
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
