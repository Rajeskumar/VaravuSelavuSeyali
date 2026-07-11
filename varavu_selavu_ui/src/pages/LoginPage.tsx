import React, { useState, useEffect, useRef } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import { login, loginWithGoogle } from '../api/auth';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';
import { PENDING_INVITE_KEY } from './JoinGroupPage';

/** After login, resumes a pending group invite (see JoinGroupPage) instead of the
 * default /dashboard destination — this app has no general "return to" mechanism,
 * so the invite flow is the one deliberate exception. */
function postLoginDestination(): string {
  const token = sessionStorage.getItem(PENDING_INVITE_KEY);
  return token ? `/groups/join/${token}` : '/dashboard';
}

/**
 * TS-DES-210 — rebuilt to match RegisterPage's Slate-era pattern (single centered card,
 * no page-specific chrome of its own) instead of the pre-Slate split-panel layout (gradient
 * tint + a stock illustration/photo banner, `glassCardSx` glassmorphism) that TS-DES-201-209
 * never touched. There's no dedicated Login prototype in `docs/design/prototypes/v2/` — this
 * mirrors the sibling auth page instead of inventing a new pattern for one screen.
 */
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
            navigate(postLoginDestination());
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
      navigate(postLoginDestination());
    } catch (err) {
      setError('Invalid credentials or server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer center maxWidth="sm" sx={{ p: 4 }}>
      <Backdrop open={googleLoading} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress color="inherit" />
          <Typography>Signing in with Google…</Typography>
        </Box>
      </Backdrop>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 420, maxWidth: '100%' }}
      >
        <Card sx={{ width: '100%' }} elevation={0}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom align="center">
              Login
            </Typography>
            <div ref={googleDiv} style={{ width: '100%', marginBottom: 16 }} />
            <Divider sx={{ mb: 2 }}>or</Divider>
            <Box component="form" onSubmit={handleLogin} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {error && (
                <Typography color="error" align="center" variant="body2">{error}</Typography>
              )}
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={googleLoading || loading}
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={googleLoading || loading}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={remember} onChange={e => setRemember(e.target.checked)} />}
                label="Remember me"
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
              <Button type="submit" variant="contained" fullWidth disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Link href="/register" variant="body2">Create account</Link>
                <Link href="/forgot-password" variant="body2">Forgot password</Link>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>
                By logging in, you agree to our{' '}
                <Link href={`${process.env.REACT_APP_API_URL || ''}/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms of Service</Link>
                {' '}and{' '}
                <Link href={`${process.env.REACT_APP_API_URL || ''}/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    </PageContainer>
  );
};

export default LoginPage;
