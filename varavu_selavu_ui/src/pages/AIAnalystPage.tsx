import React from 'react';
import { Box, Paper } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AIAnalystChat from '../components/ai-analyst/AIAnalystChat';
import { glassCardSx } from '../theme';

const AIAnalystPage: React.FC = () => {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const theme = useTheme();

  return (
    <Box sx={{ mt: 4 }}>
      <Paper elevation={2} sx={{
        ...glassCardSx(theme),
        p: 2,
      }}>
        <AIAnalystChat userId={user} />
      </Paper>
    </Box>
  );
};

export default AIAnalystPage;
