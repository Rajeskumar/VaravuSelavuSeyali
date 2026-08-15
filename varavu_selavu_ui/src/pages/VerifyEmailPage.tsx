import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';
import { verifyEmail } from '../api/auth';

type Status = 'verifying' | 'success' | 'error';

/** Landing page for the link emailed at signup (and from the "resend verification" nag
 * banner). Works whether the user is currently logged in or not — the token itself is
 * the proof, not the session. */
const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => {
        setStatus('success');
        // App.tsx's nag banner only fetches verified-status once per `user` change — without
        // this, a user who verifies mid-session (no re-login, no reload) keeps seeing "please
        // verify" until their next full page load.
        window.dispatchEvent(new Event('vs_email_verified'));
      })
      .catch(() => setStatus('error'));
  }, [token]);

  const signedIn = typeof window !== 'undefined' ? !!localStorage.getItem('vs_user') : false;

  return (
    <PageContainer center maxWidth="sm" sx={{ p: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 420, maxWidth: '100%' }}
      >
        <Card sx={{ width: '100%' }} elevation={3}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            {status === 'verifying' && (
              <>
                <CircularProgress sx={{ mb: 2 }} />
                <Typography variant="h6">Verifying your email…</Typography>
              </>
            )}
            {status === 'success' && (
              <>
                <Typography variant="h6" color="success.main" gutterBottom>
                  Email verified
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Your email address is confirmed.
                </Typography>
                <Button variant="contained" onClick={() => navigate(signedIn ? '/dashboard' : '/login')}>
                  {signedIn ? 'Go to dashboard' : 'Go to login'}
                </Button>
              </>
            )}
            {status === 'error' && (
              <>
                <Typography variant="h6" color="error" gutterBottom>
                  Link invalid or expired
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {token
                    ? 'This verification link is invalid or has expired. You can request a new one from your account settings.'
                    : 'This link is missing its verification token.'}
                </Typography>
                <Button variant="contained" onClick={() => navigate(signedIn ? '/dashboard' : '/login')}>
                  {signedIn ? 'Go to dashboard' : 'Go to login'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </PageContainer>
  );
};

export default VerifyEmailPage;
