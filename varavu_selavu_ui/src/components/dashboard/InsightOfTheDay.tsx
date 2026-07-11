import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import { useTheme } from '@mui/material/styles';
import { slate, tabularNums } from '../../theme';

export interface Insight {
  headline: string;
  detail?: string;
}

interface Props {
  insight: Insight | null;
}

/**
 * TS-DES-203 — single expandable "insight of the day" line, replacing TS-DES-111's three
 * permanent strips (MoM delta stays on the hero; WhatChangedTeaser + DueSoonStrip are deleted
 * outright). Which insight *type* shows (pace projection / biggest expense / a ranked
 * change-insight covering category-spike/new-merchant/etc.) is decided by `pickInsight()` in
 * `DashboardPage.tsx` — this component only renders whatever single `Insight` it's given.
 * Renders nothing when there's no notable insight, matching the empty-state discipline the
 * deleted components already established, rather than showing an awkward blank card.
 */
const InsightOfTheDay: React.FC<Props> = ({ insight }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const accentColor = isDark ? slate.accentDark : slate.accent;
  const [expanded, setExpanded] = React.useState(false);

  if (!insight) return null;

  return (
    <Box
      component="button"
      onClick={() => setExpanded((e) => !e)}
      sx={{
        width: '100%',
        textAlign: 'left',
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: `${slate.radius.surface}px`,
        p: 1.75,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <TrendingUpRoundedIcon sx={{ fontSize: 18, color: accentColor, flexShrink: 0, mt: '1px' }} />
        <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.8125rem', color: 'text.primary', ...tabularNums }}>
          {insight.headline}
        </Typography>
        {insight.detail && (
          expanded
            ? <ExpandLessRoundedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
            : <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        )}
      </Box>
      {expanded && insight.detail && (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>
          {insight.detail}
        </Typography>
      )}
    </Box>
  );
};

export default InsightOfTheDay;
