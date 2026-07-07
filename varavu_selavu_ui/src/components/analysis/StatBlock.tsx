import React from 'react';
import { Box, Typography } from '@mui/material';
import { typeScale } from '../../theme';

interface StatBlockProps {
  label: string;
  value: React.ReactNode;
  color?: string;
}

export const StatBlock: React.FC<StatBlockProps> = ({ label, value, color }) => {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 0.5 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          ...typeScale.amount,
          fontSize: '1.25rem', // Slightly larger than base amount
          color: color || 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};
