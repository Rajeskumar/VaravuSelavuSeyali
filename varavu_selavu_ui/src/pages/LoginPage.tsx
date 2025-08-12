import React, { useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import { login } from '../api/login';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
      navigate('/home');
    } catch (err) {
      setError('Invalid credentials or server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 400, mx: 'auto', mt: 8, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom align="center">
          Login
        </Typography>
        <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 2 }}>
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
              <Button type="submit" variant="contained" color="primary" fullWidth disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

export default LoginPage;
