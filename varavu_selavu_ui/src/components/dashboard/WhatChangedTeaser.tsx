import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import NewReleasesRoundedIcon from '@mui/icons-material/NewReleasesRounded';
import { useTheme } from '@mui/material/styles';
import { reconcile, typeScale, tabularNums } from '../../theme';
import { ChangeInsight } from '../../api/analytics';

interface Props {
  insights: ChangeInsight[];
}

/**
 * Single top "what changed" teaser (TS-DES-111) — reuses the same data
 * SmartChangeInsightsCard (Analysis page) already fetches, ranked by relative
 * magnitude per TS-ANL-004, showing only the single most significant change
 * rather than duplicating that page's full list. Renders nothing when there
 * are no significant changes, matching that card's own empty-state discipline.
 */
const WhatChangedTeaser: React.FC<Props> = ({ insights }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const jadeColor = isDark ? reconcile.jadeDark : reconcile.jadeText;
  const emberColor = isDark ? reconcile.emberDark : reconcile.ember;

  if (insights.length === 0) return null;
  const top = insights[0];
  const isNew = top.change_percent === 100;
  const isIncrease = top.change_amount > 0;
  const color = isNew ? theme.palette.info.main : isIncrease ? emberColor : jadeColor;
  const Icon = isNew ? NewReleasesRoundedIcon : isIncrease ? TrendingUpRoundedIcon : TrendingDownRoundedIcon;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>WHAT CHANGED</Typography>
        <Typography
          variant="caption"
          onClick={() => navigate('/analysis')}
          sx={{ color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}
        >
          See all ›
        </Typography>
      </Box>
      <Box
        onClick={() => navigate('/analysis')}
        sx={{
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: `${reconcile.radius.surface}px`,
          p: 1.5,
          cursor: 'pointer',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Icon sx={{ fontSize: 16, color }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {top.metric_name}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color, ...tabularNums }}>
            {top.change_amount > 0 ? '+' : ''}${Math.abs(top.change_amount).toFixed(2)}
          </Typography>
          {!isNew && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              ({top.change_percent > 0 ? '+' : ''}{top.change_percent.toFixed(0)}% vs last period)
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default WhatChangedTeaser;
