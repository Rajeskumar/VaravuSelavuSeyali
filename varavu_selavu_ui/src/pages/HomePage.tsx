import React from 'react';
import { Box, Container, Typography, Button, Grid, Stack, useTheme } from '@mui/material';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import InsightsIcon from '@mui/icons-material/Insights';
import SecurityIcon from '@mui/icons-material/Security';
import BoltIcon from '@mui/icons-material/Bolt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { brand, withAlpha, glassCardSx, motion as motionTokens } from '../theme';

const reveal = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

const HeroVisual: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box sx={{ width: { xs: '100%', sm: 720 }, aspectRatio: '16 / 10', mx: 'auto' }}>
      <svg viewBox="0 0 960 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isDark ? '#1C1C1E' : '#111827'} />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={brand.gradientStart} />
            <stop offset="100%" stopColor={brand.gradientEnd} />
          </linearGradient>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={brand.gradientEnd} />
            <stop offset="100%" stopColor={brand.gradientStart} />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="20" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>
        <rect x="40" y="40" width="880" height="520" rx="28" fill="url(#bgGrad)" stroke="rgba(255,255,255,0.08)" filter="url(#shadow)" />
        <rect x="64" y="64" width="832" height="56" rx="14" fill="rgba(255,255,255,0.06)" />
        <g opacity="0.9">
          <rect x="100" y="380" width="36" height="140" fill="url(#barGrad)" rx="10" />
          <rect x="152" y="340" width="36" height="180" fill="url(#barGrad)" rx="10" opacity="0.9" />
          <rect x="204" y="300" width="36" height="220" fill="url(#barGrad)" rx="10" opacity="0.8" />
          <rect x="256" y="360" width="36" height="160" fill="url(#barGrad)" rx="10" opacity="0.85" />
          <rect x="308" y="320" width="36" height="200" fill="url(#barGrad)" rx="10" opacity="0.9" />
        </g>
        <path d="M420 450 C 470 380, 520 420, 570 360 S 670 320, 720 360 S 820 300, 860 340" stroke="url(#lineGrad)" strokeWidth="6" fill="none" opacity="0.9" />
        <g fill="#fff">
          <circle cx="420" cy="450" r="5" opacity="0.8" />
          <circle cx="570" cy="360" r="5" opacity="0.8" />
          <circle cx="720" cy="360" r="5" opacity="0.8" />
          <circle cx="860" cy="340" r="5" opacity="0.8" />
        </g>
        <g transform="translate(760,220)">
          <circle r="56" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
          <circle r="56" fill="none" stroke={brand.gradientEnd} strokeWidth="16" strokeDasharray="220 200" strokeLinecap="round" transform="rotate(-90)" />
        </g>
      </svg>
    </Box>
  );
};

const FEATURES = [
  { title: 'Smart categorization', desc: 'Learns from your edits to keep entry effortless.', icon: InsightsIcon },
  { title: 'Trends & forecasts', desc: 'See what changed and what’s next at a glance.', icon: AutoGraphIcon },
  { title: 'Privacy-first', desc: 'Your data stays yours. No ads. No resale.', icon: SecurityIcon },
];

const STANDOUT = [
  { title: 'Frictionless input', desc: 'Photo to text, CSV import, and keyboard‑first quick add.', icon: BoltIcon },
  { title: 'Insights, not overload', desc: 'Clear explanations for spikes and trends — in context.', icon: VisibilityIcon },
  { title: 'Your data, respected', desc: 'No ads. No resale. Simple export when you want.', icon: ShieldOutlinedIcon },
];

const IconBadge: React.FC<{ Icon: React.ElementType }> = ({ Icon }) => (
  <Box
    sx={{
      width: 52,
      height: 52,
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: `linear-gradient(135deg, ${brand.gradientStart}, ${brand.gradientEnd})`,
      mb: 2,
    }}
  >
    <Icon sx={{ color: '#fff', fontSize: 26 }} />
  </Box>
);

const HomePage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('vs_token') : null;

  return (
    <Box sx={{ overflowX: 'hidden' }}>
      {/* Hero */}
      <Box sx={{ position: 'relative', pt: { xs: 16, md: 20 }, pb: { xs: 10, md: 14 } }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            background: theme.palette.mode === 'dark'
              ? `radial-gradient(60% 50% at 50% 0%, ${withAlpha(brand.gradientStartDark, 0.22)} 0%, transparent 60%)`
              : `radial-gradient(60% 50% at 50% 0%, ${withAlpha(brand.gradientStart, 0.12)} 0%, transparent 60%)`,
          }}
        />
        <Container maxWidth="md">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionTokens.slow, ease: motionTokens.easing }}>
            <Typography
              variant="h1"
              component="h1"
              sx={{
                fontSize: { xs: '2.75rem', sm: '4rem', md: '5.25rem' },
                textAlign: 'center',
                mb: 3,
              }}
            >
              Track less.{' '}
              <Box
                component="span"
                sx={{
                  backgroundImage: `linear-gradient(135deg, ${brand.gradientStart}, ${brand.gradientEnd})`,
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Understand more.
              </Box>
            </Typography>
            <Typography
              variant="h5"
              sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 400, maxWidth: 640, mx: 'auto', mb: 5 }}
            >
              A calm, fast, privacy-first companion for everyday money decisions. No ads, no clutter — just clarity.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                size="large"
                variant="contained"
                color="primary"
                onClick={() => navigate(token ? '/dashboard' : '/login')}
              >
                {token ? 'Open Dashboard' : 'Get Started'}
              </Button>
              <Button
                size="large"
                variant="outlined"
                color="inherit"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Learn more
              </Button>
            </Stack>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: motionTokens.slow, ease: motionTokens.easing, delay: 0.15 }}
            style={{ marginTop: 72 }}
          >
            <HeroVisual />
          </motion.div>
        </Container>
      </Box>

      {/* Features */}
      <Container id="features" maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
        <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, textAlign: 'center', mb: 7 }}>
            Thoughtfully designed features
          </Typography>
        </motion.div>
        <Grid container columns={12} spacing={3}>
          {FEATURES.map((f, i) => (
            <Grid size={{ xs: 12, md: 4 }} key={f.title}>
              <motion.div
                {...reveal}
                transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: i * 0.08 }}
                style={{ height: '100%' }}
              >
                <Box sx={{ ...glassCardSx(theme), height: '100%', p: 3.5 }}>
                  <IconBadge Icon={f.icon} />
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{f.title}</Typography>
                  <Typography variant="body1" color="text.secondary">{f.desc}</Typography>
                </Box>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Vision */}
      <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : '#F5F5F7', py: { xs: 10, md: 14 } }}>
        <Container maxWidth="md">
          <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: '2rem', md: '3rem' }, textAlign: 'center', mb: 0 }}
            >
              A calm, trustworthy companion for everyday money decisions — no noise, no ads.
              <Box component="span" sx={{ color: 'text.secondary' }}> Just clarity and confidence.</Box>
            </Typography>
          </motion.div>
        </Container>
      </Box>

      {/* Stands out */}
      <Container maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
        <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, textAlign: 'center', mb: 7 }}>
            How TrackSpense stands out
          </Typography>
        </motion.div>
        <Grid container columns={12} spacing={5}>
          {STANDOUT.map((c, i) => (
            <Grid size={{ xs: 12, md: 4 }} key={c.title}>
              <motion.div
                {...reveal}
                transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: i * 0.08 }}
              >
                <IconBadge Icon={c.icon} />
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{c.title}</Typography>
                <Typography variant="body1" color="text.secondary">{c.desc}</Typography>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA Footer */}
      <Box
        sx={{
          color: '#fff',
          background: `linear-gradient(135deg, ${brand.gradientStart} 0%, ${brand.gradientEnd} 100%)`,
        }}
      >
        <Container maxWidth="md" sx={{ py: { xs: 10, md: 14 }, textAlign: 'center' }}>
          <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
            <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' }, mb: 2 }}>
              Ready to take control?
            </Typography>
            <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 400, mb: 5 }}>
              Join now and turn your spending data into decisions you feel good about.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                size="large"
                sx={{ bgcolor: '#fff', color: '#000', '&:hover': { bgcolor: '#f2f2f2' } }}
                onClick={() => navigate(token ? '/dashboard' : '/login')}
              >
                {token ? 'Open Dashboard' : 'Login to start tracking'}
              </Button>
              <Button
                size="large"
                variant="outlined"
                sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }}
                onClick={() => navigate('/register')}
              >
                Create a free account
              </Button>
            </Stack>
          </motion.div>
        </Container>
      </Box>
    </Box>
  );
};

export default HomePage;
