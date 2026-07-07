import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

interface SparklineDataPoint {
  label: string;
  value: number;
}

interface MonthlySpendSparklineProps {
  data: SparklineDataPoint[];
}

export const MonthlySpendSparkline: React.FC<MonthlySpendSparklineProps> = ({ data }) => {
  const theme = useTheme();
  const max = Math.max(...data.map(d => d.value), 1);
  const height = 48; // taller than prototype for better tap targets and visibility

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height }}>
        {data.map((d, i) => {
          const barHeight = Math.max(4, (d.value / max) * height);
          const isLast = i === data.length - 1;
          return (
            <Box
              key={i}
              sx={{
                flex: 1,
                height: barHeight,
                borderRadius: '4px',
                backgroundColor: isLast ? theme.palette.text.primary : theme.palette.divider,
                transition: 'height 0.3s ease',
              }}
            />
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        {data.map((d, i) => (
          <Typography
            key={i}
            sx={{
              fontFamily: 'Inter',
              fontSize: 10,
              color: 'text.secondary',
              flex: 1,
              textAlign: 'center'
            }}
          >
            {d.label}
          </Typography>
        ))}
      </Box>
    </Box>
  );
};
