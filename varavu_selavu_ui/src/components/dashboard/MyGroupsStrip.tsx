import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { useTheme } from '@mui/material/styles';
import { cerebro, typeScale, tabularNums } from '../../theme';
import { GroupSummary } from '../../api/groups';
import { AnalysisGroupSummary } from '../../api/analysis';
import { isSettled } from '../../utils/balance';
import { formatMoney } from '../../utils/money';

interface StripGroup {
  group_id: string;
  name: string;
  member_count: number;
  currency: string;
  /** Settled = no outstanding balance either way, matching TrueTotalHero's rule. */
  settled: boolean;
  pendingAmount: number;
  /** True when the group owes the viewer (positive balance). */
  owedToMe: boolean;
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
      currency: g.currency,
      settled: isSettled(balance),
      pendingAmount,
      owedToMe: balance > 0,
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
  const positiveColor = theme.palette.success.main;
  const negativeColor = theme.palette.error.main;
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
              borderRadius: `${cerebro.radius.surface}px`,
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
                <CheckIcon sx={{ fontSize: 13, color: positiveColor }} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: positiveColor }}>
                  Settled
                </Typography>
              </Box>
            ) : (
              // Direction in words and color: this used to be a red "$X pending" even when the
              // money was owed to the viewer, which the Groups page shows in green.
              <Typography variant="caption" sx={{ fontWeight: 600, color: g.owedToMe ? positiveColor : negativeColor, ...tabularNums }}>
                {g.owedToMe ? `you're owed ${formatMoney(g.pendingAmount, g.currency)}` : `you owe ${formatMoney(g.pendingAmount, g.currency)}`}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default MyGroupsStrip;
