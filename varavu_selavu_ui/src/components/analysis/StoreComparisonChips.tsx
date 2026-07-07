import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckRounded';
import { typeScale } from '../../theme';

interface StoreComparison {
  store_name: string;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  purchase_count: number;
}

interface StoreComparisonChipsProps {
  stores: StoreComparison[];
}

export const StoreComparisonChips: React.FC<StoreComparisonChipsProps> = ({ stores }) => {
  const theme = useTheme();
  
  // Sort by average price to find the cheapest
  const sorted = [...stores].sort((a, b) => (a.avg_price ?? 0) - (b.avg_price ?? 0));

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {sorted.map((s, i) => {
        const isCheapest = i === 0;
        return (
          <Box
            key={s.store_name}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${isCheapest ? theme.palette.success.main : theme.palette.divider}`,
              backgroundColor: isCheapest ? `${theme.palette.success.main}14` : theme.palette.background.paper,
            }}
          >
            {isCheapest && <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />}
            <Typography sx={{ fontFamily: typeScale.amount.fontFamily, fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
              {s.store_name}
            </Typography>
            <Typography sx={{ ...typeScale.amount, fontSize: 13, color: 'text.secondary' }}>
              avg ${(s.avg_price ?? 0).toFixed(2)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};
