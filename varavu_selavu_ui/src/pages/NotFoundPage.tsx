import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import PageContainer from '../components/layout/PageContainer';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const loggedIn = !!localStorage.getItem('vs_user');

  return (
    <PageContainer center maxWidth="sm" sx={{ p: 4 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h2" sx={{ fontWeight: 800, mb: 1 }}>
          404
        </Typography>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Page not found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          That page doesn't exist or may have moved.
        </Typography>
        <Button variant="contained" onClick={() => navigate(loggedIn ? '/dashboard' : '/')}>
          {loggedIn ? 'Back to dashboard' : 'Back home'}
        </Button>
      </Box>
    </PageContainer>
  );
};

export default NotFoundPage;
