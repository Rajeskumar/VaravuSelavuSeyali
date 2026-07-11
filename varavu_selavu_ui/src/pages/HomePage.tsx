import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';
import Footer from '../components/layout/Footer';
import { typeScale, motion as motionTokens } from '../theme';

// TS-DES-210 — HomePage rebuild. The prior version (real product screenshots, a gradient hero,
// glassmorphism showcase cards, a Vision band, a 4-card privacy/trust grid, and a gradient CTA
// footer) predates the Slate pivot entirely and was never touched by TS-DES-201-209. Restructured
// to match `docs/design/prototypes/v2/desktop/DesktopHome.jsx` (and the mobile counterpart,
// `prototypes/v2/Home.jsx`, for the `xs`/`sm` layout) rather than re-tokening the old structure:
// both reference files are this short (hero + 3 illustrative preview cards), with no Vision/
// trust-grid/gradient-CTA sections at all — those are dropped, not restyled.

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink': '#B4694A',
  Home: '#6B7A99',
  Transportation: '#5C8C82',
};

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
};

/** Shared card chrome for the three illustrative previews below — flat Slate surface,
 * hairline border, no shadow/blur (matches every `docs/design/prototypes/v2/**` reference). */
const PreviewCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      overflow: 'hidden',
      backgroundColor: 'background.paper',
      p: 2,
      width: '100%',
    }}
  >
    {children}
  </Box>
);

const PreviewEyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography sx={{ ...typeScale.label, fontSize: '0.6rem', color: 'text.secondary', mb: 1 }}>
    {children}
  </Typography>
);

/** Illustrative only — a pre-login marketing page has no real session to fetch data for, so
 * this mirrors the reference prototype's static dummy values rather than wiring up a live fetch. */
const DashboardPreview: React.FC = () => (
  <PreviewCard>
    <PreviewEyebrow>July 2026</PreviewEyebrow>
    <Typography sx={{ ...typeScale.display, fontSize: '1.75rem', textAlign: 'center', color: 'text.primary' }}>
      $2,190.10
    </Typography>
    <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 1.5 }}>
      1 group still settling
    </Typography>
    <Box sx={{ display: 'flex', width: '100%', height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: 'divider', mb: 1.5 }}>
      <Box sx={{ width: '46%', backgroundColor: CATEGORY_COLORS['Food & Drink'] }} />
      <Box sx={{ width: '30%', backgroundColor: CATEGORY_COLORS.Home }} />
      <Box sx={{ width: '24%', backgroundColor: CATEGORY_COLORS.Transportation }} />
    </Box>
    <Box sx={{ backgroundColor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.primary' }}>
        Weekend Trip
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>
        $162.00 pending
      </Typography>
    </Box>
  </PreviewCard>
);

const AnalysisPreview: React.FC = () => {
  const bars = [0.62, 0.68, 0.55, 0.75, 0.61, 0.79];
  return (
    <PreviewCard>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
        Analysis
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ ...typeScale.label, fontSize: '0.6rem', color: 'text.secondary' }}>2026 YTD</Typography>
        <Typography sx={{ ...typeScale.display, fontSize: '0.95rem', color: 'text.primary' }}>$13,263</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 32 }}>
        {bars.map((v, i) => (
          <Box
            key={i}
            sx={{
              flex: 1,
              height: `${v * 100}%`,
              borderRadius: 0.5,
              backgroundColor: i === bars.length - 1 ? 'primary.main' : 'divider',
            }}
          />
        ))}
      </Box>
    </PreviewCard>
  );
};

const AskPreview: React.FC = () => (
  <PreviewCard>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1.25 }}>
      AI Analyst
    </Typography>
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        maxWidth: '78%',
        ml: 'auto',
        mb: 0.75,
        backgroundColor: 'text.primary',
        color: 'background.paper',
        borderRadius: 1.25,
        px: 1.25,
        py: 0.75,
      }}
    >
      How much on dining?
    </Typography>
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        maxWidth: '85%',
        backgroundColor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.25,
        px: 1.25,
        py: 0.75,
        color: 'text.primary',
        lineHeight: 1.4,
      }}
    >
      $142.30 across 9 visits — 32% more than usual.
    </Typography>
  </PreviewCard>
);

const PAGES = [
  { Preview: DashboardPreview, title: 'One ledger for everything', body: 'Personal spending and every group you split with, combined into one number — no more adding things up across apps.' },
  { Preview: AnalysisPreview, title: 'See exactly where it goes', body: 'Year-to-date totals, six-month trends, and a category breakdown that actually explains itself — not just numbers in a table.' },
  { Preview: AskPreview, title: 'Ask, in plain English', body: '"How much did I spend on dining this month?" Ask from anywhere in the app and get a real answer pulled from your own data.' },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('vs_token') : null;

  return (
    <Box>
      <PageContainer maxWidth="md" sx={{ pt: { xs: 8, md: 10 }, pb: { xs: 6, md: 8 } }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionTokens.slow, ease: motionTokens.easing }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography component="div" sx={{ ...typeScale.display, fontSize: { xs: '2rem', md: '2.75rem' }, color: 'text.primary', lineHeight: 1.1 }}>
              Track less.
            </Typography>
            <Typography component="div" sx={{ ...typeScale.display, fontSize: { xs: '2rem', md: '2.75rem' }, color: 'primary.main', lineHeight: 1.1, mb: 2 }}>
              Understand more.
            </Typography>
            <Typography sx={{ color: 'text.secondary', maxWidth: 440, mx: 'auto', mb: 4, fontSize: '1.05rem' }}>
              A calm, fast, privacy-first companion for everyday money decisions. No ads, no clutter — just clarity.
            </Typography>
            <Button
              size="large"
              variant="contained"
              color="primary"
              endIcon={<ArrowForwardRoundedIcon />}
              onClick={() => navigate(token ? '/dashboard' : '/register')}
            >
              {token ? 'Open Dashboard' : 'Try TrackSpense free'}
            </Button>

            {/* "See how it works" scroll cue is a mobile-prototype-only affordance
                (Home.jsx) — DesktopHome.jsx's wider viewport shows the preview grid
                without needing to point at it. */}
            <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 2 }}>
              <Typography
                component="button"
                onClick={() => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                sx={{ border: 'none', background: 'none', cursor: 'pointer', color: 'text.secondary', fontSize: '0.9rem', p: 0 }}
              >
                See how it works ↓
              </Typography>
            </Box>
          </Box>
        </motion.div>
      </PageContainer>

      <PageContainer id="product" maxWidth="lg" sx={{ pb: { xs: 8, md: 10 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: { xs: 5, md: 4 },
          }}
        >
          {PAGES.map(({ Preview, title, body }, i) => (
            <motion.div key={title} {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: i * 0.08 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <Box sx={{ width: '100%', maxWidth: 260 }}>
                  <Preview />
                </Box>
                <Typography sx={{ fontWeight: 600, color: 'text.primary', mt: 2, mb: 0.5 }}>{title}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 280 }}>
                  {body}
                </Typography>
              </Box>
            </motion.div>
          ))}
        </Box>
      </PageContainer>

      <Footer />
    </Box>
  );
};

export default HomePage;
