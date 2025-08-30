import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import { loginWithGoogle, register } from '../api/auth';

const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const googleDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      // Not blocking manual registration if GSI isn't configured
      // eslint-disable-next-line no-console
      console.warn('Google signup not configured (missing REACT_APP_GOOGLE_CLIENT_ID)');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const w = window as any;
      if (!w.google || !googleDiv.current) return;
      w.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: any) => {
          try {
            const data = await loginWithGoogle(resp.credential);
            localStorage.setItem('vs_token', data.access_token);
            localStorage.setItem('vs_refresh', data.refresh_token);
            if (data.email) localStorage.setItem('vs_user', data.email);
            window.dispatchEvent(new Event('vs_auth_changed'));
            navigate('/dashboard');
          } catch {
            setError('Google signup failed');
          }
        },
      });
      w.google.accounts.id.renderButton(googleDiv.current, {
        theme: 'outline',
        size: 'large',
        width: '100%',
        text: 'signup_with',
      });
    };
    document.head.appendChild(script);
  }, [navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ name, email, phone, password });
      navigate('/');
    } catch {
      setError('Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
      <Card sx={{ width: 420, maxWidth: '100%' }} elevation={3}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" gutterBottom align="center">
            Create Account
          </Typography>
          <div ref={googleDiv} style={{ width: '100%', marginBottom: 16 }} />
          <Divider sx={{ mb: 2 }}>or</Divider>
          <Box component="form" onSubmit={handleRegister} noValidate>
            <Grid container spacing={2}>
              {error && (
                <Grid size={12}>
                  <Typography color="error" align="center">{error}</Typography>
                </Grid>
              )}
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </Grid>
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
                  label="Phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
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
                <Button type="submit" variant="contained" fullWidth disabled={loading}>
                  {loading ? 'Creating...' : 'Create Account'}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default RegisterPage;
