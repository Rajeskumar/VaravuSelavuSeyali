import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';
import { resetPassword } from '../api/auth';

/** Landing page for the link emailed by `/auth/forgot-password` — token lives in the URL,
 * never typed by the user. A used/expired/malformed token surfaces as one generic error
 * (the backend doesn't distinguish, so neither does this page). */
const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword({ token, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      setError('This reset link is invalid or has expired. Request a new one from the login page.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer center maxWidth="sm" sx={{ p: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 420, maxWidth: '100%' }}
      >
        <Card sx={{ width: '100%' }} elevation={3}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom align="center">
              Reset Password
            </Typography>
            {!token ? (
              <Typography color="error" align="center">
                This link is missing its reset token. Request a new one from the login page.
              </Typography>
            ) : success ? (
              <Typography color="success.main" align="center">
                Password reset — redirecting to login...
              </Typography>
            ) : (
              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={2}>
                  {error && (
                    <Grid size={12}>
                      <Typography color="error" align="center">{error}</Typography>
                    </Grid>
                  )}
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="New Password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      inputProps={{ minLength: 8 }}
                      helperText="At least 8 characters"
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Confirm New Password"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Button type="submit" variant="contained" fullWidth disabled={loading}>
                      {loading ? 'Resetting...' : 'Reset Password'}
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Link href="/login" variant="body2">Back to Login</Link>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    </PageContainer>
  );
};

export default ResetPasswordPage;
