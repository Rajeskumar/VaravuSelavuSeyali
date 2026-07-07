import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { useTheme } from '@mui/material/styles';
import { reconcile, typeScale, tabularNums } from '../../theme';
import { GroupSummary } from '../../api/groups';
import { AnalysisGroupSummary } from '../../api/analysis';

interface StripGroup {
  group_id: string;
  name: string;
  member_count: number;
  /** Settled = no outstanding balance either way, matching TrueTotalHero's rule. */
  settled: boolean;
  pendingAmount: number;
}

function formatMoney(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`;
}

function mergeGroups(groups: GroupSummary[], summaries: AnalysisGroupSummary[]): StripGroup[] {
  const summaryById = new Map(summaries.map((s) => [s.group_id, s]));
  return groups.map((g) => {
    const s = summaryById.get(g.group_id);
    const balance = s ? s.my_balance : g.my_balance;
    const pendingAmount = Math.abs(balance);
    return {
      group_id: g.group_id,
      name: g.name,
      member_count: g.member_count,
      settled: Math.abs(balance) < 0.005,
      pendingAmount,
    };
  });
}

interface Props {
  groups: GroupSummary[];
  groupSummaries: AnalysisGroupSummary[];
}

/** Horizontally scrollable "My Groups" strip (TS-DES-103), replacing
 * MyGroupsWidget's grid-card presentation. Only rendered by DashboardPage once
 * useGroupsEnabled() confirms the flag is on and there is at least one group. */
const MyGroupsStrip: React.FC<Props> = ({ groups, groupSummaries }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const jadeColor = isDark ? reconcile.jadeDark : reconcile.jadeText;
  const emberColor = isDark ? reconcile.emberDark : reconcile.ember;
  const merged = mergeGroups(groups, groupSummaries);

  if (merged.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>MY GROUPS</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{merged.length} active</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5 }}>
        {merged.map((g) => (
          <Box
            key={g.group_id}
            onClick={() => navigate(`/groups/${g.group_id}`)}
            sx={{
              flexShrink: 0,
              width: 160,
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: `${reconcile.radius.surface}px`,
              p: 1.5,
              cursor: 'pointer',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.25 }} noWrap>
              {g.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              {g.member_count} people
            </Typography>
            {g.settled ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckIcon sx={{ fontSize: 13, color: jadeColor }} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: jadeColor }}>
                  Settled
                </Typography>
              </Box>
            ) : (
              <Typography variant="caption" sx={{ fontWeight: 600, color: emberColor, ...tabularNums }}>
                {formatMoney(g.pendingAmount)} pending
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default MyGroupsStrip;
