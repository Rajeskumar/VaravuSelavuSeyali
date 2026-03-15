import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Alert, Chip, Divider, IconButton } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { useNavigate } from 'react-router-dom';
import { getChangeInsights, ChangeInsight } from '../../api/analytics';

interface SmartChangeInsightsCardProps {
  userId: string | null;
  year: number;
  month?: number;
}

export default function SmartChangeInsightsCard({ userId, year, month }: SmartChangeInsightsCardProps) {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<ChangeInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getChangeInsights(userId, { year, month })
      .then(setInsights)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId, year, month]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (insights.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No significant changes detected for this period.
        </Typography>
      </Box>
    );
  }

  const handleNavigate = (insight: ChangeInsight) => {
    // If we have a specific entity name, navigate with a query param so
    // the target page can auto-select the detail.
    const entity = insight.entity_name;
    if (insight.time_scope === 'merchant') {
      if (entity) navigate(`/merchant-insights?merchant=${encodeURIComponent(entity)}`);
      else navigate('/merchant-insights');
    } else if (insight.time_scope === 'item') {
      if (entity) navigate(`/item-insights?item=${encodeURIComponent(entity)}`);
      else navigate('/item-insights');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {insights.map((insight, idx) => (
        <Card
          key={idx}
          variant="outlined"
          sx={{
            borderRadius: 3,
            borderColor: 'rgba(0,0,0,0.08)',
            backgroundColor: 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(8px)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {insight.change_percent === 100 ? (
                  <NewReleasesIcon color="info" fontSize="small" />
                ) : insight.change_amount > 0 ? (
                  <TrendingUpIcon color="error" fontSize="small" />
                ) : (
                  <TrendingDownIcon color="success" fontSize="small" />
                )}
                <Typography variant="subtitle2" fontWeight={700}>
                  {insight.metric_name}
                </Typography>
              </Box>
              {(insight.time_scope === 'merchant' || insight.time_scope === 'item') && (
                <IconButton size="small" onClick={() => handleNavigate(insight)} sx={{ mt: -0.5, mr: -0.5 }}>
                  <ArrowForwardIcon fontSize="small" />
                </IconButton>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="h5" fontWeight={800} color={insight.change_amount > 0 && insight.change_percent !== 100 ? 'error.main' : insight.change_percent === 100 ? 'info.main' : 'success.main'}>
                {insight.change_amount > 0 ? '+' : ''}${Math.abs(insight.change_amount).toFixed(2)}
              </Typography>
              {insight.change_percent !== 100 && (
                <Chip
                  size="small"
                  label={`${insight.change_percent > 0 ? '+' : ''}${insight.change_percent}%`}
                  color={insight.change_amount > 0 ? 'error' : 'success'}
                  sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                />
              )}
            </Box>

            {insight.change_percent !== 100 ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                vs ${insight.previous_value.toFixed(2)} last period
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {insight.time_scope}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
