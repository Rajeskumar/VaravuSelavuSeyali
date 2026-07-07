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
      <Box sx={{ px: 2, pb: 2, display: 'flex', gap: 2, overflowX: 'auto' }}>
        {[1, 2, 3].map(i => (
          <Box key={i} sx={{ width: 190, height: 132, borderRadius: 2.5, bgcolor: theme.palette.divider, flexShrink: 0, opacity: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (insights.length === 0) {
    return (
      <Box sx={{ px: 2, pb: 2 }}>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 12, color: 'text.secondary' }}>
          No significant changes detected for this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', px: 2, pb: 2, '&::-webkit-scrollbar': { display: 'none' }, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
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
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: 190,
              height: 132,
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2.5,
              p: 1.75,
            }}
          >
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <Typography sx={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>
                  {headline}
                </Typography>
                {!isNew && (
                  isUp ? (
                    <ArrowUpRightIcon sx={{ fontSize: 16, color: 'error.main', flexShrink: 0, mt: 0.25 }} />
                  ) : (
                    <ArrowDownRightIcon sx={{ fontSize: 16, color: 'success.main', flexShrink: 0, mt: 0.25 }} />
                  )
                )}
              </Box>
              {sub && (
                <Typography sx={{ fontFamily: 'Inter', fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                  {sub}
                </Typography>
              )}
            </Box>
            
            <Box sx={{ height: 28, display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
              {/* No sparkline data available from backend, keeping empty space for layout stability */}
            </Box>
            
            <Box
              component="button"
              onClick={() => onAsk(insight)}
              sx={{
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: 600,
                color: theme.palette.primary.main,
                textAlign: 'left',
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
