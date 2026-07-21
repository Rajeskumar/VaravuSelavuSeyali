import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, IconButton } from '@mui/material';
import ArrowUpRightIcon from '@mui/icons-material/ArrowOutwardRounded';
import ArrowDownRightIcon from '@mui/icons-material/SubdirectoryArrowRightRounded';
import { useTheme } from '@mui/material/styles';
import { getChangeInsights, ChangeInsight } from '../../api/analytics';

interface WhatChangedRailProps {
  userId: string | null;
  year: number;
  month?: number;
  onAsk: (insight: ChangeInsight) => void;
}

export const WhatChangedRail: React.FC<WhatChangedRailProps> = ({ userId, year, month, onAsk }) => {
  const theme = useTheme();
  const [insights, setInsights] = useState<ChangeInsight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getChangeInsights({ year, month })
      .then(setInsights)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, year, month]);

  if (loading) {
    return (
      <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[1, 2, 3].map(i => (
          <Box key={i} sx={{ height: 88, borderRadius: 1.2, bgcolor: theme.palette.divider, opacity: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (insights.length === 0) {
    return (
      <Box sx={{ px: 2, pb: 2 }}>
        <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 12, color: 'text.secondary' }}>
          No significant changes detected for this period.
        </Typography>
      </Box>
    );
  }

  return (
    // Vertical stack, not a horizontal-scroll rail — a row of fixed-width cards wider than the
    // viewport forced a horizontal scrollbar to appear on the page itself (not just within the
    // rail), which read as broken layout rather than an intentional scroll affordance.
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, px: 2, pb: 2 }}>
      {insights.map((insight, idx) => {
        const isNew = insight.change_percent === 100;
        const isUp = insight.change_amount > 0;

        let headline = '';
        if (isNew) {
          headline = `New ${insight.time_scope}: ${insight.entity_name || insight.metric_name} — $${insight.change_amount.toFixed(2)}`;
        } else {
          headline = `${insight.entity_name || insight.metric_name} is ${isUp ? 'up' : 'down'} ${Math.abs(insight.change_percent)}% vs last period`;
        }

        let sub = isNew ? `First time here this ${month ? 'month' : 'year'}` : '';

        return (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1.2,
              p: 1.5,
            }}
          >
            {!isNew && (
              isUp ? (
                <ArrowUpRightIcon sx={{ fontSize: 18, color: 'error.main', flexShrink: 0 }} />
              ) : (
                <ArrowDownRightIcon sx={{ fontSize: 18, color: 'success.main', flexShrink: 0 }} />
              )
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 13, fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>
                {headline}
              </Typography>
              {sub && (
                <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
                  {sub}
                </Typography>
              )}
            </Box>
            <Box
              component="button"
              onClick={() => onAsk(insight)}
              sx={{
                flexShrink: 0,
                fontFamily: 'Instrument Sans',
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.primary.main,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {isNew ? 'Ask about it →' : 'Ask why →'}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
