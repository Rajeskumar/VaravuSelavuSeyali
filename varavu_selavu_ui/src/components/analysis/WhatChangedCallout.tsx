import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

interface WhatChangedCalloutProps {
  message: string;
}

export const WhatChangedCallout: React.FC<WhatChangedCalloutProps> = ({ message }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2.5,
        padding: 2,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}
    >
      <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.primary', lineHeight: 1.5, fontWeight: 500 }}>
        {message}
      </Typography>
    </Box>
  );
};
