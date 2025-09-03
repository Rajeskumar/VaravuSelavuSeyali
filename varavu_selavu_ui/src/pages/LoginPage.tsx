import React, { useState, useEffect, useRef } from 'react';
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
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import { login, loginWithGoogle } from '../api/auth';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();
  const googleDiv = useRef<HTMLDivElement>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

    if (!clientId) {
      // Surface a friendly error rather than letting GSI throw
      setError('Google login not configured (missing REACT_APP_GOOGLE_CLIENT_ID)');
      // Helpful hint in console for developers
      // eslint-disable-next-line no-console
      console.warn('Set REACT_APP_GOOGLE_CLIENT_ID in .env.development/.env.production');
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
            setGoogleLoading(true);
            const data = await loginWithGoogle(resp.credential);
            localStorage.setItem('vs_token', data.access_token);
            localStorage.setItem('vs_refresh', data.refresh_token);
            if (data.email) localStorage.setItem('vs_user', data.email);
            window.dispatchEvent(new Event('vs_auth_changed'));
            navigate('/dashboard');
          } catch {
            setError('Google login failed');
          } finally {
            setGoogleLoading(false);
          }
        },
      });
      w.google.accounts.id.renderButton(googleDiv.current, {
        theme: 'outline',
        size: 'large',
        width: '100%',
      });
    };
    document.head.appendChild(script);
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await login({ username: email, password });
      // Persist tokens and user id for subsequent API calls
      localStorage.setItem('vs_token', response.access_token);
      localStorage.setItem('vs_refresh', response.refresh_token);
      localStorage.setItem('vs_user', response.email || email);
      window.dispatchEvent(new Event('vs_auth_changed'));
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid credentials or server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
      {(() => {
        // Use the bundled banner image from public/
        const bgUrl = `${process.env.PUBLIC_URL || ''}/expense_login_banner.png`;
        return (
      <Box
        sx={{
          flex: 1,
          position: 'relative',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
          // Layer: tint gradient, local banner (if present), then a hosted fallback
          backgroundImage: `linear-gradient(135deg, rgba(79,70,229,0.86) 0%, rgba(20,184,166,0.86) 100%), url(${bgUrl}), url(https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1600&auto=format&fit=crop)`,
          backgroundSize: 'cover, cover, cover',
          backgroundPosition: 'center, center, center',
          backgroundRepeat: 'no-repeat',
          // Add subtle decorative shape glow
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(40% 30% at 80% 15%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%), radial-gradient(30% 25% at 20% 80%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 60%)',
            pointerEvents: 'none',
          },
        }}
      >
        <Typography
          variant="h4"
          sx={{
            maxWidth: 320,
            fontWeight: 800,
            lineHeight: 1.15,
            textShadow: '0 2px 14px rgba(0,0,0,0.4)',
          }}
        >
          Track, analyze & plan your spending.
        </Typography>
      </Box>
        );
      })()}
      <Box sx={{ flex: { xs: '1 1 auto', md: '0 0 520px' }, width: { xs: '100%', md: 520 }, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Backdrop open={googleLoading} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress color="inherit" />
            <Typography>Signing in with Google…</Typography>
          </Box>
        </Backdrop>
        <Card
          sx={{
            width: 420,
            maxWidth: '100%',
            backdropFilter: 'blur(14px)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.22) 100%)',
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: '0 16px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
            borderRadius: 3,
          }}
          elevation={0}
        >
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom align="center">
              Login
            </Typography>
            <div ref={googleDiv} style={{ width: '100%', marginBottom: 16 }} />
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
                    disabled={googleLoading || loading}
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
                    disabled={googleLoading || loading}
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
                  <Link href="/register" variant="body2">Create account</Link>
                  <Link href="/forgot-password" variant="body2">Forgot password</Link>
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
