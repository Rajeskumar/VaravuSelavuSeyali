import React from 'react';
import { Box, Card, CardContent, Typography, Button } from '@mui/material';

const ProfilePage: React.FC = () => {
  const email = localStorage.getItem('vs_user') || '';

  const handleLogout = () => {
    localStorage.removeItem('vs_user');
    localStorage.removeItem('vs_token');
    window.dispatchEvent(new Event('vs_auth_changed'));
    // Do not navigate here; header handler does on menu. This page can be reached directly too.
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Profile
          </Typography>
          <Typography variant="body1">Signed in as: {email || 'Guest'}</Typography>
          {email && (
            <Button sx={{ mt: 2 }} variant="outlined" color="error" onClick={handleLogout}>
              Logout
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ProfilePage;
