import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';
import Footer from '../components/layout/Footer';
import SegmentedTabs from '../components/common/SegmentedTabs';
import { typeScale, motion as motionTokens, withAlpha } from '../theme';
import { HEADER_HEIGHT } from '../components/layout/layoutConstants';

// Rebuilt from the Claude Design mock "TrackSpense Home.dc.html" (marketing landing page).
// Two deliberate deviations from the mock, decided with the user before implementing:
// 1. The mock's own sticky <header>/nav (logo, Features/How/FAQ links, "Open app" button) is
//    dropped — App.tsx already renders a global fixed AppBar with the logo + Login button on
//    every route including this one; a second header would stack two chrome bars.
// 2. The mock's third small feature card ("Group chat, in context" — per-expense comments) was
//    swapped for a card about the AI Analyst's create_expense/create_group_expense tools instead,
//    since expense comments (TS-GRP-126) aren't built yet and the chat-can-log-it capability is a
//    real, newly-shipped feature.
// Everything else (hero copy/mock card, four feature cards, how-it-works, FAQ, CTA) tracks the
// mock closely, using the app's real Slate tokens/components (SegmentedTabs, PageContainer,
// Footer) instead of the mock's raw inline styles.

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
};

// Anchor sections sit under the fixed AppBar (56px mobile / HEADER_HEIGHT desktop) — scroll-
// margin-top keeps a jump-to-section click from landing the heading right under the header.
const ANCHOR_SCROLL_MARGIN = { xs: 56 + 16, md: HEADER_HEIGHT + 16 };

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const sectionHeadingSx = {
  fontFamily: typeScale.display.fontFamily,
  fontWeight: 700,
  fontSize: { xs: '1.75rem', md: '2.125rem' },
  letterSpacing: '-0.02em',
  textAlign: 'center' as const,
  color: 'text.primary',
};

const cardTitleSx = {
  fontFamily: typeScale.display.fontFamily,
  fontWeight: 700,
  fontSize: '1.15rem',
  color: 'text.primary',
};

/** Small "label value" pill used in the hero's WILL LOG mini-panel — same visual language as
 * `WillLogPreview`'s own chip helper, hand-rolled here (not reused) since this illustration has
 * no submit action, unlike the real component's clickable "Log it" pill. */
const logChip = (label: string, value: string) => (
  <Box
    key={label}
    sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5, fontSize: 12 }}
  >
    <Box component="span" sx={{ color: 'text.secondary' }}>{label} </Box>
    <Box component="span" sx={{ fontWeight: 700 }}>{value}</Box>
  </Box>
);

const FeatureCard: React.FC<{ title: string; body: string; children?: React.ReactNode }> = ({ title, body, children }) => (
  <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
    <Typography sx={cardTitleSx}>{title}</Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, lineHeight: 1.65 }}>{body}</Typography>
    {children && <Box sx={{ mt: 2 }}>{children}</Box>}
  </Box>
);

const SmallFeatureCard: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3 }}>
    <Typography sx={{ fontFamily: typeScale.display.fontFamily, fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>{title}</Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75, lineHeight: 1.6 }}>{body}</Typography>
  </Box>
);

const STEPS = [
  { n: 1, title: 'Log it', body: 'Type a line, tap the keypad, or scan a receipt. Personal or group — one flow.' },
  { n: 2, title: 'It sorts itself', body: 'Your share joins your personal total; the rest lands on the right people in the right group.' },
  { n: 3, title: 'Settle in one tap', body: 'One payment per person clears every group you share — recorded per-group underneath.' },
];

const FAQS = [
  {
    q: 'Does TrackSpense combine personal and group expenses?',
    a: 'Yes. Your share of every group expense automatically joins your personal total, so you always see your true spend for the month — one ledger, not two apps.',
  },
  {
    q: 'How fast can I log an expense?',
    a: 'Type a line like "coffee 6.75 at Blue Bottle" and TrackSpense parses the amount, merchant, category, and split. Or scan a receipt — it takes seconds either way.',
  },
  {
    q: 'Can I settle up across multiple groups at once?',
    a: 'Yes. The People view nets what each person owes you across every shared group, so one settlement clears everything — recorded per-group underneath.',
  },
  {
    q: 'Is TrackSpense free?',
    a: 'TrackSpense is free to use for personal tracking and group splitting.',
  },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('vs_token') : null;
  const goStart = () => navigate(token ? '/dashboard' : '/register');

  return (
    <Box>
      {/* ===== Hero ===== */}
      <Box sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.default' : '#EFEFEA'), borderBottom: '1px solid', borderColor: 'divider' }}>
        <PageContainer
          maxWidth="lg"
          sx={{
            py: { xs: 6, md: 10 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
            gap: { xs: 6, md: 7 },
            alignItems: 'center',
          }}
        >
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionTokens.slow, ease: motionTokens.easing }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 999,
                px: 1.75,
                py: 0.75,
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'primary.main',
                letterSpacing: '0.04em',
              }}
            >
              NEW · TRACKSPENSE V3
            </Box>

            <Typography
              component="h1"
              sx={{
                fontFamily: typeScale.display.fontFamily,
                fontWeight: 700,
                fontSize: { xs: '2.25rem', md: '3.375rem' },
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: 'text.primary',
                mt: 2,
                mb: 0,
              }}
            >
              Your money and your groups. One ledger.
            </Typography>

            <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.65, color: 'text.secondary', mt: 2.25, maxWidth: 480 }}>
              Most apps track <em>your</em> spending or <em>shared</em> bills. TrackSpense does both — your share of every split
              automatically joins your personal total, so you always know what this month really cost you.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1.5, mt: 3.5, flexWrap: 'wrap' }}>
              <Button size="large" variant="contained" color="primary" endIcon={<ArrowForwardRoundedIcon />} onClick={goStart}>
                Start tracking — free
              </Button>
              <Button size="large" variant="outlined" color="inherit" onClick={() => scrollToId('how')}>
                See how it works
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 2.5, mt: 3, flexWrap: 'wrap' }}>
              {['Free to use', 'No card required', 'Works with your groups'].map((label) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CheckRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
                </Box>
              ))}
            </Box>
          </motion.div>

          {/* Illustrative product mock — mirrors DashboardPage's real TrueTotalHero (lens toggle,
              spend total, "Net with people") plus its "My Groups" balance rows. Static values, no
              live session to fetch on a pre-login marketing page. */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionTokens.slow, ease: motionTokens.easing, delay: 0.1 }}>
            <Box sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' } }} aria-hidden="true">
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 360,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2.5,
                  p: 2.5,
                  boxShadow: (t) => (t.palette.mode === 'dark' ? 'none' : '0 24px 64px rgba(24,24,27,0.12)'),
                }}
              >
                <SegmentedTabs
                  value="share"
                  onChange={() => {}}
                  size="small"
                  ariaLabel="My expenses or I paid (illustrative)"
                  options={[{ value: 'share', label: 'My expenses' }, { value: 'paid', label: 'I paid' }]}
                />

                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>Spent this month — your true total</Typography>
                  <Typography sx={{ ...typeScale.displayHero, fontSize: '2.5rem', color: 'text.primary' }}>$1,432.60</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>$1,180.40 personal + group shares</Typography>
                </Box>

                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 2, pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>Net with people</Typography>
                    <Typography sx={{ ...typeScale.display, fontSize: '1.625rem', color: 'success.main' }}>+$56.80</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    owed $84.30 · owe $27.50 →
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.75 }}>
                  <Box sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.hover' : 'background.default'), border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.75, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>🏠 Roommates</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>+$56.80</Typography>
                  </Box>
                  <Box sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.hover' : 'background.default'), border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.75, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>✈️ Weekend Trip</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>−$27.50</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          </motion.div>
        </PageContainer>
      </Box>

      {/* ===== Features ===== */}
      <PageContainer id="features" maxWidth="lg" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: ANCHOR_SCROLL_MARGIN }}>
        <Typography sx={sectionHeadingSx}>Built for the four things you actually do</Typography>
        <Typography sx={{ textAlign: 'center', color: 'text.secondary', fontSize: '0.975rem', mt: 1.5, mx: 'auto', maxWidth: 560, lineHeight: 1.6 }}>
          Log it fast. Split it fairly. See who owes what. Settle up. Everything else supports those four.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.25, mt: 5.5 }}>
          <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing }}>
            <FeatureCard title="Log it in one line" body={'Type “coffee 6.75 at Blue Bottle” — TrackSpense parses the amount, merchant, category, and split. Or snap a receipt and let it read the line items.'}>
              <Box sx={{ bgcolor: (t) => withAlpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.08), border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.75 }}>
                <Typography sx={{ ...typeScale.label, fontSize: '0.65rem', color: 'primary.main' }}>✨ WILL LOG:</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                  {logChip('Amount', '$6.75')}
                  {logChip('Merchant', 'Blue Bottle')}
                  {logChip('Category', 'Dining out')}
                </Box>
              </Box>
            </FeatureCard>
          </motion.div>

          <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: 0.06 }}>
            <FeatureCard title="Split without spreadsheets" body="Equal, by shares, or exact amounts — pick the group, TrackSpense does the math and shows your share before you save. Rent, trips, dinners: handled.">
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.75, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Split equally · 4 people · your share <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>$21.05</Box>
                </Typography>
                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, flexShrink: 0 }}>Adjust</Typography>
              </Box>
            </FeatureCard>
          </motion.div>

          <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: 0.12 }}>
            <FeatureCard title="One balance per person" body="Stop doing mental math across groups. The People view nets everything you share with someone into one number — and one settlement clears it all.">
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                    SK
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
                    Sam K <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· 2 groups</Box>
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>+$62.10</Typography>
                </Box>
                <Box sx={{ px: 1.75, py: 1.25, textAlign: 'center', bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.hover' : 'background.default') }}>
                  <Box component="span" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 999, px: 2, py: 0.75, fontSize: '0.75rem', fontWeight: 700, display: 'inline-block' }}>
                    Record Sam paid $62.10
                  </Box>
                </Box>
              </Box>
            </FeatureCard>
          </motion.div>

          <motion.div {...reveal} transition={{ duration: motionTokens.base, ease: motionTokens.easing, delay: 0.18 }}>
            <FeatureCard title="Insights that explain themselves" body={'Not just charts — a “what changed” view that names the category, the merchant, and the reason. Item and merchant breakdowns include your group shares.'}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.75, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Dining out <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· Nopa was the biggest</Box>
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.main', flexShrink: 0 }}>+34%</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.75, py: 1.25, gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Groceries <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· Costco bulk run, split</Box>
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', flexShrink: 0 }}>−12%</Typography>
                </Box>
              </Box>
            </FeatureCard>
          </motion.div>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.25, mt: 2.25 }}>
          <SmallFeatureCard title="Receipt scanning" body="Snap it — amount, merchant, and line items are parsed and ready to split." />
          <SmallFeatureCard title="Recurring, watched" body="Rent and subscriptions tracked with due dates and a running monthly total." />
          <SmallFeatureCard title="Just tell the AI" body={'Ask the AI Analyst to log an expense in plain English — “Sam paid $40 for groceries, split with Roommates” — and it’s saved. No form, no keypad.'} />
        </Box>
      </PageContainer>

      {/* ===== How it works ===== */}
      <PageContainer id="how" maxWidth="lg" sx={{ py: { xs: 8, md: 9 }, scrollMarginTop: ANCHOR_SCROLL_MARGIN }}>
        <Typography sx={sectionHeadingSx}>From “who paid?” to “all settled” in three steps</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3.5, mt: 5.5 }}>
          {STEPS.map(({ n, title, body }) => (
            <Box key={n} sx={{ textAlign: 'center', px: 2 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: typeScale.display.fontFamily,
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  mx: 'auto',
                }}
              >
                {n}
              </Box>
              <Typography sx={{ fontFamily: typeScale.display.fontFamily, fontWeight: 700, fontSize: '1.05rem', color: 'text.primary', mt: 1.75 }}>
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, lineHeight: 1.65 }}>{body}</Typography>
            </Box>
          ))}
        </Box>
      </PageContainer>

      {/* ===== FAQ ===== */}
      <Box id="faq" sx={{ bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.default' : '#EFEFEA'), borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', scrollMarginTop: ANCHOR_SCROLL_MARGIN }}>
        <PageContainer maxWidth={false} sx={{ maxWidth: 760, mx: 'auto', py: { xs: 8, md: 9 } }}>
          <Typography sx={sectionHeadingSx}>Questions, answered</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 4.5 }}>
            {FAQS.map(({ q, a }) => (
              <Accordion key={q} elevation={0} disableGutters sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{q}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.65 }}>{a}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </PageContainer>
      </Box>

      {/* ===== CTA ===== */}
      <PageContainer maxWidth="md" sx={{ py: { xs: 8, md: 10 }, textAlign: 'center' }}>
        <Typography sx={{ fontFamily: typeScale.display.fontFamily, fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' }, letterSpacing: '-0.03em', color: 'text.primary' }}>
          Know what this month really cost you.
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.975rem', mt: 1.75, mx: 'auto', maxWidth: 460, lineHeight: 1.6 }}>
          Free to start. Your groups will thank you at settle-up time.
        </Typography>
        <Box sx={{ mt: 3 }}>
          <Button size="large" variant="contained" color="primary" onClick={goStart}>
            Start tracking — free
          </Button>
        </Box>
      </PageContainer>

      <Footer />
    </Box>
  );
};

export default HomePage;
