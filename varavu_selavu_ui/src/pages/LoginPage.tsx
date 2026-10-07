import React, { useState, useRef } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import { login, loginWithGoogle, ApiError } from '../api/auth';
import { useNavigate } from 'react-router-dom';
import PasswordField from '../components/common/PasswordField';
import GoogleSignInButton, { isGoogleSignInConfigured } from '../components/auth/GoogleSignInButton';
import { motion } from 'framer-motion';
import { SESSION_ENDED_KEY } from '../api/request';
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
  const passwordRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [googleLoading, setGoogleLoading] = useState(false);


  const handleGoogleCredential = async (credential: string) => {
    try {
      setGoogleLoading(true);
      const data = await loginWithGoogle(credential);
      // Tokens are set as HttpOnly cookies by the server. Only the
      // display identity is kept client-side.
      if (data.email) localStorage.setItem('vs_user', data.email);
      window.dispatchEvent(new Event('vs_auth_changed'));
      sessionStorage.removeItem(SESSION_ENDED_KEY);
      navigate(postLoginDestination());
    } catch {
      setError('Google login failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // The form is noValidate, so `required` doesn't stop an empty submit. Without this an
    // empty form hit the server (422 -> "Something went wrong on our end") and spent one of
    // the user's 5 login attempts per minute. Mirrors mobile's LoginScreen check.
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await login({ username: email, password });
      // Tokens are set as HttpOnly cookies by the server; persisting them here
      // would put them back within reach of any script on the page.
      localStorage.setItem('vs_user', response.email || email);
      window.dispatchEvent(new Event('vs_auth_changed'));
      sessionStorage.removeItem(SESSION_ENDED_KEY);
      navigate(postLoginDestination());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError('Too many attempts — wait a minute and try again.');
        } else if (err.status === 401 || err.status === 400) {
          setError('Incorrect email or password.');
        } else {
          setError('Something went wrong on our end. Please try again.');
        }
      } else {
        setError("Can't reach the server — check your connection and try again.");
      }
    } finally {
      setLoading(false);
      // Submitting disables the fields, which drops focus to <body>; put it back on the field to
      // retype so keyboard and screen-reader users land next to the (role=alert) message.
      requestAnimationFrame(() => passwordRef.current?.focus());
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
            <Typography variant="h6" component="h1" gutterBottom align="center">
              Login
            </Typography>
            {sessionStorage.getItem(SESSION_ENDED_KEY) && <Typography role="status" variant="body2" sx={{ mb: 2 }}>Your session ended. Sign in again to continue. Any recoverable expense draft will reopen. If a save was in progress, check Expenses to confirm its outcome.</Typography>}
            {isGoogleSignInConfigured() && (
              <>
                <Box sx={{ mb: 2 }}>
                  <GoogleSignInButton onCredential={handleGoogleCredential} text="signin_with" disabled={loading || googleLoading} />
                </Box>
                <Divider sx={{ mb: 2 }}>or</Divider>
              </>
            )}
            <Box component="form" onSubmit={handleLogin} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {error && (
                <Typography id="login-error" role="alert" color="error" align="center" variant="body2">{error}</Typography>
              )}
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                error={!!error}
                slotProps={{ htmlInput: { autoComplete: 'username', 'aria-describedby': error ? 'login-error' : undefined } }}
                disabled={googleLoading || loading}
              />
              <PasswordField
                fullWidth
                label="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                error={!!error}
                inputRef={passwordRef}
                slotProps={{ htmlInput: { autoComplete: 'current-password', 'aria-describedby': error ? 'login-error' : undefined } }}
                disabled={googleLoading || loading}
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
                <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms of Service</Link>
                {' '}and{' '}
                <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    </PageContainer>
  );
};

export default LoginPage;
