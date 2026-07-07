import React from 'react';
import { Box, useTheme, Typography } from '@mui/material';

interface ItemPriceHistory {
  date: string;
  store_name: string | null;
  unit_price: number | null;
  quantity: number;
}

interface PriceHistoryChartProps {
  history: ItemPriceHistory[];
}

export const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({ history }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!history || history.length === 0) return null;

  // We want chronological order for the chart (assuming input is descending by date usually)
  const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const prices = sortedHistory.map((h) => h.unit_price ?? 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 400, h = 80, padX = 16, padTop = 10, padBottom = 10;
  const usableW = w - padX * 2;
  const usableH = h - padTop - padBottom;

  const points = sortedHistory.map((pt, i) => ({
    x: padX + (i * usableW) / Math.max(sortedHistory.length - 1, 1),
    y: padTop + usableH - (((pt.unit_price ?? 0) - min) / range) * usableH,
    ...pt,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  
  const lastDelta = points.length > 1 ? (points[points.length - 1].unit_price ?? 0) - (points[points.length - 2].unit_price ?? 0) : 0;
  const lastColor = lastDelta > 0 ? theme.palette.error.main : lastDelta < 0 ? theme.palette.success.main : theme.palette.text.primary;
  const inkColor = theme.palette.text.primary;

  return (
    <Box>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={inkColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle 
            key={i} 
            cx={p.x} 
            cy={p.y} 
            r={i === points.length - 1 ? 4 : 2.5} 
            fill={i === points.length - 1 ? lastColor : (isDark ? theme.palette.background.paper : inkColor)} 
            stroke={i === points.length - 1 ? 'none' : inkColor}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 2, mt: 0.5 }}>
        {sortedHistory.map((pt, i) => {
          // Only show some labels if there are many points to avoid crowding
          if (sortedHistory.length > 8 && i % Math.ceil(sortedHistory.length / 5) !== 0 && i !== sortedHistory.length - 1 && i !== 0) {
             return <Box key={i} component="span" sx={{ width: 0, overflow: 'hidden' }} />;
          }
          const d = new Date(pt.date);
          return (
            <Typography key={i} sx={{ fontFamily: 'Inter', fontSize: 10, color: 'text.secondary' }}>
              {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
};
