import React from 'react';
import { Box, Container, Typography, Button, Grid, Card, CardContent, Stack, useTheme } from '@mui/material';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import InsightsIcon from '@mui/icons-material/Insights';
import SecurityIcon from '@mui/icons-material/Security';
import { useNavigate } from 'react-router-dom';

const HeroVisual: React.FC = () => (
  <Box sx={{ width: { xs: '100%', sm: 720 }, aspectRatio: '16 / 10', mx: 'auto' }}>
    <svg viewBox="0 0 960 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="100%" stopColor="#0b0b0b" />
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="20" floodColor="#000" floodOpacity="0.5" />
        </filter>
      </defs>
      {/* Card Background */}
      <rect x="40" y="40" width="880" height="520" rx="24" fill="url(#bgGrad)" stroke="rgba(255,255,255,0.08)" filter="url(#shadow)" />
      {/* Title Bar */}
      <rect x="64" y="64" width="832" height="56" rx="12" fill="rgba(255,255,255,0.06)" />
      {/* Bars */}
      <g opacity="0.9">
        <rect x="100" y="380" width="36" height="140" fill="url(#barGrad)" rx="8" />
        <rect x="152" y="340" width="36" height="180" fill="url(#barGrad)" rx="8" opacity="0.9" />
        <rect x="204" y="300" width="36" height="220" fill="url(#barGrad)" rx="8" opacity="0.8" />
        <rect x="256" y="360" width="36" height="160" fill="url(#barGrad)" rx="8" opacity="0.85" />
        <rect x="308" y="320" width="36" height="200" fill="url(#barGrad)" rx="8" opacity="0.9" />
      </g>
      {/* Line Chart */}
      <path d="M420 450 C 470 380, 520 420, 570 360 S 670 320, 720 360 S 820 300, 860 340" stroke="url(#lineGrad)" strokeWidth="6" fill="none" opacity="0.9" />
      <g fill="#fff">
        <circle cx="420" cy="450" r="5" opacity="0.8" />
        <circle cx="570" cy="360" r="5" opacity="0.8" />
        <circle cx="720" cy="360" r="5" opacity="0.8" />
        <circle cx="860" cy="340" r="5" opacity="0.8" />
      </g>
      {/* Pie/Donut */}
      <g transform="translate(760,220)">
        <circle r="56" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
        <circle r="56" fill="none" stroke="#34d399" strokeWidth="16" strokeDasharray="220 200" strokeLinecap="round" transform="rotate(-90)" />
      </g>
    </svg>
  </Box>
);

const HomePage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('vs_token') : null;

  return (
    <Box>
      {/* Hero — Apple-like clean, dark, centered */}
      <Box sx={{ bgcolor: '#000', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
          <Grid container columns={12} spacing={4} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                <Typography variant="h2" component="h1" sx={{ fontWeight: 800, letterSpacing: -0.5, mb: 1 }}>
                  Varavu Selavu
                </Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                  Track less. Understand more. Make better money decisions.
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.72)', mb: 4 }}>
                  Designed to be calm, fast, and privacy‑first — no ads, no clutter.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mb: { xs: 0, md: 0 } }}>
                  <Button
                    size="large"
                    sx={{
                      px: 3.5,
                      py: 1.25,
                      bgcolor: '#fff',
                      color: '#000',
                      '&:hover': { bgcolor: '#f2f2f2' },
                      borderRadius: 999,
                      fontWeight: 700,
                    }}
                    onClick={() => navigate(token ? '/dashboard' : '/login')}
                  >
                    {token ? 'Open Dashboard' : 'Get Started'}
                  </Button>
                  <Button
                    size="large"
                    sx={{
                      px: 3.5,
                      py: 1.25,
                      color: '#fff',
                      borderColor: 'rgba(255,255,255,0.6)',
                      borderRadius: 999,
                    }}
                    variant="outlined"
                    onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Learn more
                  </Button>
                </Stack>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ textAlign: { xs: 'center', md: 'right' } }}>
              <Box sx={{ display: 'inline-block', width: { xs: '100%', md: '92%' } }}>
                <HeroVisual />
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features — gradient row */}
      <Box sx={{
        background: 'linear-gradient(135deg, #FFF7ED 0%, #ECFEFF 100%)',
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}>
      <Container id="features" maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 6, textAlign: 'center' }}>
          Thoughtfully designed features
        </Typography>
        <Grid container columns={12} spacing={3}>
          {[{
            title: 'Smart categorization',
            desc: 'Learns from your edits to keep entry effortless.',
            icon: <InsightsIcon />,
          },{
            title: 'Trends & forecasts',
            desc: 'See what changed and what’s next at a glance.',
            icon: <AutoGraphIcon />,
          },{
            title: 'Privacy-first',
            desc: 'Your data stays yours. No ads. No resale.',
            icon: <SecurityIcon />,
          }].map((f) => (
            <Grid size={{ xs: 12, md: 4 }} key={f.title}>
              <Card elevation={0} variant="outlined" sx={{ height: '100%', p: 1.5 }}>
                <CardContent>
                  <Box sx={{ fontSize: 0, color: theme.palette.text.secondary, mb: 1 }}>{f.icon}</Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{f.title}</Typography>
                  <Typography variant="body1" color="text.secondary">{f.desc}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
      </Box>

      {/* Vision — gradient row */}
      <Box sx={{
        background: 'linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)',
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}>
        <Container maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, textAlign: 'center' }}>Our vision</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 880, mx: 'auto', textAlign: 'center' }}>
            A calm, trustworthy companion for everyday money decisions — no noise, no ads. Just clarity and confidence.
          </Typography>
        </Container>
      </Box>

      {/* Unique — dark gradient row */}
      <Box sx={{
        color: '#fff',
        position: 'relative',
        background: 'linear-gradient(135deg, #0b0b0b 0%, #111827 100%)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        '&:before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(60% 50% at 85% 10%, ${theme.palette.primary.main}22 0%, transparent 60%)`,
          pointerEvents: 'none',
        },
      }}>
        <Container maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, textAlign: 'center' }}>How Varavu Selavu stands out</Typography>
          <Grid container columns={12} spacing={3}>
            {[{
              title: 'Frictionless input',
              desc: 'Photo to text, CSV import, and keyboard‑first quick add.',
            }, {
              title: 'Insights, not overload',
              desc: 'Clear explanations for spikes and trends — in context.',
            }, {
              title: 'Your data, respected',
              desc: 'No ads. No resale. Simple export when you want.',
            }].map((c) => (
              <Grid size={{ xs: 12, md: 4 }} key={c.title}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{c.title}</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>{c.desc}</Typography>
              </Grid>
            ))}
          </Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 6 }} justifyContent="center">
            <Button
              sx={{ px: 3.5, py: 1.25, bgcolor: '#fff', color: '#000', '&:hover': { bgcolor: '#f2f2f2' }, borderRadius: 999 }}
              onClick={() => navigate(token ? '/dashboard' : '/login')}
            >
              {token ? 'Open Dashboard' : 'Login to start tracking'}
            </Button>
            <Button variant="outlined" sx={{ px: 3.5, py: 1.25, color: '#fff', borderColor: 'rgba(255,255,255,0.6)', borderRadius: 999 }} onClick={() => navigate('/register')}>Create a free account</Button>
          </Stack>
        </Container>
      </Box>

      {/* CTA Footer — gradient row */}
      <Box sx={{ color: '#fff', background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)` }}>
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 }, textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>Ready to take control?</Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, mb: 3 }}>
            Join now and turn your spending data into decisions you feel good about.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button sx={{ px: 3.5, py: 1.25, bgcolor: '#fff', color: '#000', '&:hover': { bgcolor: '#f2f2f2' }, borderRadius: 999 }} onClick={() => navigate(token ? '/dashboard' : '/login')}>
              {token ? 'Open Dashboard' : 'Login'}
            </Button>
            <Button variant="outlined" sx={{ px: 3.5, py: 1.25, color: '#fff', borderColor: 'rgba(255,255,255,0.6)', borderRadius: 999 }} onClick={() => navigate('/register')}>Create Account</Button>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

export default HomePage;
