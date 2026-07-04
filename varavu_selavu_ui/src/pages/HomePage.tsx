import React from 'react';
import { Box, Container, Typography, Button, Grid, Stack, useTheme, Link as MuiLink } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { brand, withAlpha, glassCardSx, motion as motionTokens } from '../theme';
import API_BASE_URL from '../api/apiconfig';

const reveal = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

const asset = (path: string) => `${process.env.PUBLIC_URL || ''}${path}`;

const PRODUCT_SHOTS = [
  {
    title: 'See everything at a glance',
    desc: 'Your dashboard surfaces total spend, this month vs. this week, and a live category breakdown — no spreadsheets required.',
    image: '/screenshots/dashboard.png',
  },
  {
    title: 'Understand what changed, and why',
    desc: 'Monthly analysis highlights spend swings and top categories automatically, so you catch surprises before they add up.',
    image: '/screenshots/analysis.png',
  },
  {
    title: 'Ask questions in plain English',
    desc: 'The AI Analyst answers questions like "How much did I spend at Amazon?" or "Where did I get eggs cheapest?" using your real data.',
    image: '/screenshots/ai-analyst.png',
  },
  {
    title: 'Snap a receipt, skip the typing',
    desc: 'Upload a photo of a receipt and TrackSpense extracts the merchant, items, and total for you.',
    image: '/screenshots/receipt-scan.png',
  },
];

const TRUST_POINTS = [
  {
    icon: CloudQueueIcon,
    title: 'Your data, hosted securely',
    desc: 'Account and expense data are stored in an encrypted cloud database, sent over HTTPS/TLS between your device and our servers.',
  },
  {
    icon: BlockOutlinedIcon,
    title: 'Never sold, never advertised against',
    desc: "We don't sell your personal or financial data, and TrackSpense has no ads or ad trackers to monetize your spending habits.",
  },
  {
    icon: LockOutlinedIcon,
    title: 'AI features, used deliberately',
    desc: 'Your question and the minimum context needed are sent to our AI provider only when you use the AI Analyst or receipt scan — never in the background.',
  },
  {
    icon: DeleteOutlineIcon,
    title: 'Delete anytime, for good',
    desc: 'Permanently delete your account and every expense record from Profile → Delete Account. It’s irreversible by design.',
  },
];

const ProductShot: React.FC<{ image: string; title: string }> = ({ image, title }) => (
  <Box
    component="img"
    src={asset(image)}
    alt={title}
    sx={{
      width: '100%',
      height: 'auto',
      display: 'block',
      borderRadius: 3,
    }}
  />
);

const HomePage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('vs_token') : null;
  const year = new Date().getFullYear();

  return (
    <Box sx={{ overflowX: 'hidden' }}>
      {/* Hero */}
      <Box sx={{ position: 'relative', pt: { xs: 16, md: 20 }, pb: { xs: 8, md: 10 } }}>
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
            <Stack alignItems="center" spacing={1.5}>
              <Button
                size="large"
                variant="contained"
                color="primary"
                onClick={() => navigate(token ? '/dashboard' : '/register')}
              >
                {token ? 'Open Dashboard' : 'Try TrackSpense free'}
              </Button>
              <MuiLink
                component="button"
                type="button"
                underline="hover"
                sx={{ color: 'text.secondary', fontSize: '0.9rem' }}
                onClick={() => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                See how it works ↓
              </MuiLink>
            </Stack>
          </motion.div>

          {/* Real product screenshot, framed like a browser window */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: motionTokens.slow, ease: motionTokens.easing, delay: 0.15 }}
            style={{ marginTop: 64 }}
          >
            <Box sx={{ maxWidth: 1040, mx: 'auto' }}>
              <ProductShot image="/screenshots/dashboard.png" title="TrackSpense dashboard" />
            </Box>
          </motion.div>
        </Container>
      </Box>

      {/* Product showcase — real screenshots */}
      <Container id="product" maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
        <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, textAlign: 'center', mb: 2 }}>
            One app, your whole financial picture
          </Typography>
          <Typography variant="h6" sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 400, maxWidth: 640, mx: 'auto', mb: 8 }}>
            Every screen below is TrackSpense, running on real data.
          </Typography>
        </motion.div>

        <Stack spacing={{ xs: 8, md: 10 }}>
          {PRODUCT_SHOTS.map((shot, i) => (
            <Grid container columns={12} spacing={5} alignItems="center" key={shot.title} direction={i % 2 === 1 ? 'row-reverse' : 'row'}>
              <Grid size={{ xs: 12, md: 6 }}>
                <motion.div
                  {...reveal}
                  transition={{ duration: motionTokens.base, ease: motionTokens.easing }}
                >
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, mb: 2 }}>
                    {shot.title}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.05rem' }}>
                    {shot.desc}
                  </Typography>
                </motion.div>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <motion.div
                  {...reveal}
                  transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: 0.1 }}
                >
                  <Box sx={{ ...glassCardSx(theme), p: 1.5 }}>
                    <ProductShot image={shot.image} title={shot.title} />
                  </Box>
                </motion.div>
              </Grid>
            </Grid>
          ))}
        </Stack>
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

      {/* Privacy / trust block */}
      <Container maxWidth="lg" sx={{ py: { xs: 10, md: 14 } }}>
        <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, textAlign: 'center', mb: 2 }}>
            Privacy-first, substantiated
          </Typography>
          <Typography variant="h6" sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 400, maxWidth: 640, mx: 'auto', mb: 7 }}>
            Not just a tagline — here's exactly what that means for your data.
          </Typography>
        </motion.div>
        <Grid container columns={12} spacing={3}>
          {TRUST_POINTS.map((point, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={point.title}>
              <motion.div
                {...reveal}
                transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: i * 0.08 }}
                style={{ height: '100%' }}
              >
                <Box sx={{ ...glassCardSx(theme), height: '100%', p: 3 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundImage: `linear-gradient(135deg, ${brand.gradientStart}, ${brand.gradientEnd})`,
                      mb: 2,
                    }}
                  >
                    <point.icon sx={{ color: '#fff', fontSize: 22 }} />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{point.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{point.desc}</Typography>
                </Box>
              </motion.div>
            </Grid>
          ))}
        </Grid>
        <Typography sx={{ textAlign: 'center', mt: 5, color: 'text.secondary' }}>
          Read the full{' '}
          <MuiLink href={`${API_BASE_URL}/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</MuiLink>
          {' '}or{' '}
          <MuiLink href={`${API_BASE_URL}/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms of Service</MuiLink>.
        </Typography>
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
            <Button
              size="large"
              sx={{ bgcolor: '#fff', color: '#000', '&:hover': { bgcolor: '#f2f2f2' } }}
              onClick={() => navigate(token ? '/dashboard' : '/register')}
            >
              {token ? 'Open Dashboard' : 'Try TrackSpense free'}
            </Button>
          </motion.div>
        </Container>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ bgcolor: theme.palette.mode === 'dark' ? '#000' : '#F5F5F7', borderTop: `1px solid ${theme.palette.divider}` }}>
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Grid container columns={12} spacing={4}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>TrackSpense</Typography>
              <Typography variant="body2" color="text.secondary">
                Track less. Understand more.
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Legal</Typography>
              <Stack spacing={1}>
                <MuiLink href={`${API_BASE_URL}/privacy-policy`} target="_blank" rel="noopener noreferrer" color="text.secondary" underline="hover">
                  Privacy Policy
                </MuiLink>
                <MuiLink href={`${API_BASE_URL}/terms-of-service`} target="_blank" rel="noopener noreferrer" color="text.secondary" underline="hover">
                  Terms of Service
                </MuiLink>
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Company</Typography>
              <Stack spacing={1}>
                <MuiLink component={RouterLink} to="/contact" color="text.secondary" underline="hover">
                  Contact
                </MuiLink>
                <MuiLink component={RouterLink} to="/feature-request" color="text.secondary" underline="hover">
                  Submit an Idea
                </MuiLink>
              </Stack>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 5 }}>
            © {year} TrackSpense. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};

export default HomePage;
