import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import { forgotPassword } from '../api/auth';
import Link from "@mui/material/Link";
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await forgotPassword({ email, password });
      setSuccess('Password has been reset successfully. Please login.');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch {
      setError('Failed to reset password. Please check if the email is correct.');
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
            Forgot Password
          </Typography>
          <Box component="form" onSubmit={handleForgotPassword} noValidate>
            <Grid container spacing={2}>
              {error && (
                <Grid size={12}>
                  <Typography color="error" align="center">{error}</Typography>
                </Grid>
              )}
              {success && (
                <Grid size={12}>
                  <Typography color="success" align="center">{success}</Typography>
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
                  label="New Password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
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
                />
              </Grid>
              <Grid size={12}>
                <Button type="submit" variant="contained" fullWidth disabled={loading}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </Grid>
              <Grid size={12} sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Link href="/login" variant="body2">Back to Login</Link>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>
      </motion.div>
    </PageContainer>
  );
};

export default ForgotPasswordPage;
