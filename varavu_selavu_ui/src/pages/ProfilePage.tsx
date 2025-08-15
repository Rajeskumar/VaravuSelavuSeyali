import React from 'react';
import { Box, Card, CardContent, Typography, Button } from '@mui/material';
import { logout as apiLogout } from '../api/auth';

const ProfilePage: React.FC = () => {
  const email = localStorage.getItem('vs_user') || '';

  const handleLogout = () => {
    const refresh = localStorage.getItem('vs_refresh');
    if (refresh) {
      apiLogout(refresh);
    }
    localStorage.removeItem('vs_user');
    localStorage.removeItem('vs_token');
    localStorage.removeItem('vs_refresh');
    window.dispatchEvent(new Event('vs_auth_changed'));
    // Do not navigate here; header handler does on menu. This page can be reached directly too.
  };

  return (
    <Box sx={{ mt: 4, maxWidth: 400, mx: 'auto', px: { xs: 1, sm: 2 } }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Profile
          </Typography>
          <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
            Signed in as: {email || 'Guest'}
          </Typography>
          {email && (
            <Button sx={{ mt: 2 }} variant="outlined" color="error" fullWidth onClick={handleLogout}>
              Logout
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ProfilePage;
