import React, { useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import GoogleIcon from '@mui/icons-material/Google';
import { login } from '../api/login';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await login({ username: email, password });
      // Persist token and user id (email) for subsequent API calls
      localStorage.setItem('vs_token', response.access_token);
      localStorage.setItem('vs_user', email);
      window.dispatchEvent(new Event('vs_auth_changed'));
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid credentials or server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
      <Box
        sx={{
          flex: 1,
          background: 'linear-gradient(135deg,#4F46E5 0%,#14B8A6 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
        }}
      >
        <Typography variant="h5" sx={{ maxWidth: 280, fontWeight: 700 }}>
          Track, analyze & plan your spending.
        </Typography>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Card sx={{ width: 420, maxWidth: '100%' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom align="center">
              Login
            </Typography>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<GoogleIcon />}
              sx={{ textTransform: 'none', mb: 2 }}
            >
              Continue with Google
            </Button>
            <Divider sx={{ mb: 2 }}>or</Divider>
            <Box component="form" onSubmit={handleLogin} noValidate>
              <Grid container columns={12} spacing={2}>
                {error && (
                  <Grid size={12}>
                    <Typography color="error" align="center">{error}</Typography>
                  </Grid>
                )}
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </Grid>
                <Grid size={12}>
                  <FormControlLabel
                    control={<Checkbox checked={remember} onChange={e => setRemember(e.target.checked)} />}
                    label="Remember me"
                  />
                </Grid>
                <Grid size={12}>
                  <Button type="submit" variant="contained" fullWidth disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                  </Button>
                </Grid>
                <Grid size={12} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Link href="#" variant="body2">Create account</Link>
                  <Link href="#" variant="body2">Forgot password</Link>
                </Grid>
              </Grid>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default LoginPage;
