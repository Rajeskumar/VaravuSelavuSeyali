import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Paper } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AIAnalystChat from '../components/ai-analyst/AIAnalystChat';
import { glassCardSx } from '../theme';

const AIAnalystPage: React.FC = () => {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const theme = useTheme();
  const location = useLocation();
  const initialQuery = new URLSearchParams(location.search).get('q') || undefined;

  return (
    <Box sx={{ mt: 4 }}>
      <Paper elevation={2} sx={{
        ...glassCardSx(theme),
        p: 2,
      }}>
        <AIAnalystChat userId={user} initialQuery={initialQuery} />
      </Paper>
    </Box>
  );
};

export default AIAnalystPage;
