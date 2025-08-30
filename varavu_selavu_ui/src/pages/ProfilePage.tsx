import React from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, TextField, Alert } from '@mui/material';
import { logout as apiLogout } from '../api/auth';
import { getProfile, updateProfile } from '../api/profile';

const ProfilePage: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getProfile();
        if (!mounted) return;
        setEmail(p.email || localStorage.getItem('vs_user') || '');
        setName(p.name || '');
        setPhone(p.phone || '');
      } catch (e) {
        setError('Failed to load profile');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateProfile({ name, phone });
      setName(updated.name || '');
      setPhone(updated.phone || '');
      setSuccess('Profile updated');
    } catch (e) {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 4, maxWidth: 400, mx: 'auto', px: { xs: 1, sm: 2 } }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Profile
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          <Box component="form" onSubmit={handleSave} noValidate>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField label="Email" fullWidth value={email} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid size={12}>
                <TextField label="Name" fullWidth value={name} onChange={e => setName(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="Phone" fullWidth value={phone} onChange={e => setPhone(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <Button type="submit" variant="contained" fullWidth disabled={saving || loading}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Grid>
            </Grid>
          </Box>
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
