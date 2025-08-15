import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import { register } from '../api/auth';

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ email, password });
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
