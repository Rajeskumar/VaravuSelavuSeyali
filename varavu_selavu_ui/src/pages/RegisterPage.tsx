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
import Link from '@mui/material/Link';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import { loginWithGoogle, register, ApiError } from '../api/auth';
import PasswordField from '../components/common/PasswordField';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';

const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearField = (f: string) => setFieldErrors((prev) => (prev[f] ? { ...prev, [f]: '' } : prev));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const googleDiv = useRef<HTMLDivElement>(null);
  // The Google button (and its "or" divider) only show once GSI actually loaded and rendered —
  // a missing client ID, blocked script or failed load leaves just the email form, not an empty gap.
  const [googleReady, setGoogleReady] = useState(false);

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
    script.onerror = () => setGoogleReady(false);
    script.onload = () => {
      const w = window as any;
      if (!w.google || !googleDiv.current) return;
      w.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: any) => {
          try {
            setGoogleLoading(true);
            const data = await loginWithGoogle(resp.credential);
            // Tokens are set as HttpOnly cookies by the server.
            if (data.email) localStorage.setItem('vs_user', data.email);
            window.dispatchEvent(new Event('vs_auth_changed'));
            navigate('/dashboard');
          } catch {
            setError('Google signup failed');
          } finally {
            setGoogleLoading(false);
          }
        },
      });
      w.google.accounts.id.renderButton(googleDiv.current, {
        theme: 'outline',
        size: 'large',
        // GSI wants a pixel width (max 400); '100%' was ignored with a console warning.
        width: String(Math.min(400, googleDiv.current.offsetWidth || 400)),
        text: 'signup_with',
      });
      setGoogleReady(true);
    };
    document.head.appendChild(script);
  }, [navigate]);

  /** Same rules the server enforces, checked first so a typo costs nothing (sign-up is limited
   * to a few attempts an hour) and the message sits under the field it's about. */
  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter a valid email address, like name@example.com.';
    if (password.length < 8) errs.password = 'Use at least 8 characters.';
    return errs;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError(null);
    try {
      await register({ name, email, phone: phone || undefined, password });
      // Auto-login after successful registration
      const { login } = await import('../api/auth');
      const data = await login({ username: email, password });
      // Tokens are set as HttpOnly cookies by the server.
      if (data.email) localStorage.setItem('vs_user', data.email);
      window.dispatchEvent(new Event('vs_auth_changed'));
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = (err as ApiError & { fieldErrors?: Record<string, string> }).fieldErrors;
        if (err.status === 429) {
          setError('Too many attempts — wait a bit and try again.');
        } else if (fe && Object.keys(fe).length) {
          setFieldErrors(fe);
        } else {
          // Deliberately generic for 400/validation-class failures too (e.g. email
          // already registered) — matches the backend's anti-enumeration response.
          setError('Registration failed. Please check your details and try again.');
        }
      } else {
        setError("Can't reach the server — check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer center maxWidth="sm" sx={{ p: 4 }}>
      <Backdrop open={googleLoading} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress color="inherit" />
          <Typography>Completing Google sign up…</Typography>
        </Box>
      </Backdrop>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 420, maxWidth: '100%' }}
      >
        <Card sx={{ width: '100%' }} elevation={3}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" component="h1" gutterBottom align="center">
              Create Account
            </Typography>
            <div ref={googleDiv} style={{ width: '100%', display: 'flex', justifyContent: 'center', ...(googleReady ? { marginBottom: 16 } : { height: 0, overflow: 'hidden', visibility: 'hidden' }) }} />
            {googleReady && <Divider sx={{ mb: 2 }}>or</Divider>}
            <Box component="form" onSubmit={handleRegister} noValidate>
              <Grid container spacing={2}>
                {error && (
                  <Grid size={12}>
                    <Typography role="alert" color="error" align="center">{error}</Typography>
                  </Grid>
                )}
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Name"
                    value={name}
                    onChange={e => { setName(e.target.value); clearField('name'); }}
                    error={!!fieldErrors.name}
                    helperText={fieldErrors.name || undefined}
                    required
                    disabled={googleLoading || loading}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); clearField('email'); }}
                    onBlur={() => { if (email && validate().email) setFieldErrors((p) => ({ ...p, email: validate().email })); }}
                    error={!!fieldErrors.email}
                    helperText={fieldErrors.email || undefined}
                    autoComplete="email"
                    required
                    disabled={googleLoading || loading}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Phone (optional)"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    disabled={googleLoading || loading}
                  />
                </Grid>
                <Grid size={12}>
                  <PasswordField
                    fullWidth
                    label="Password"
                        value={password}
                    onChange={e => { setPassword(e.target.value); clearField('password'); }}
                    required
                    disabled={googleLoading || loading}
                    inputProps={{ minLength: 8 }}
                    autoComplete="new-password"
                    error={!!fieldErrors.password}
                    helperText={fieldErrors.password || 'At least 8 characters'}
                  />
                </Grid>
                <Grid size={12}>
                  <Button type="submit" variant="contained" fullWidth disabled={loading || googleLoading}>
                    {loading ? 'Creating...' : 'Create Account'}
                  </Button>
                </Grid>
                <Grid size={12} sx={{ textAlign: 'center', mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    By registering, you agree to our{' '}
                    <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms of Service</Link>
                    {' '}and{' '}
                    <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    </PageContainer>
  );
};

export default RegisterPage;
