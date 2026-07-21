import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import DocumentScannerRoundedIcon from '@mui/icons-material/DocumentScannerRounded';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useNavigate } from 'react-router-dom';
import { keyframes, useTheme } from '@mui/material/styles';
import PageContainer from '../components/layout/PageContainer';
import Footer from '../components/layout/Footer';
import SegmentedTabs from '../components/common/SegmentedTabs';
import StatusBadge from '../components/common/StatusBadge';
import AmbientBackground from '../components/common/AmbientBackground';
import ScrollReveal from '../components/common/ScrollReveal';
import { cerebro, typeScale, glassCardSx, gradientCta, withAlpha } from '../theme';
import { HEADER_HEIGHT } from '../components/layout/layoutConstants';

// Rebuilt to the CerebroOS Product Page Template (Claude Design project
// fdce9c6c-82d3-481f-ab1a-b8fa5c476682) — nav (App.tsx's global AppBar already covers this, so
// not duplicated here), hero with a typed "boot line" status badge and a gradient-shimmer
// headline ending, a browser-chrome screenshot frame, an eyebrow-labeled features grid, an
// eyebrow-labeled "how it works" section, an FAQ (kept from the pre-CerebroOS page — real,
// useful content the template doesn't have an equivalent slot for, so it stays as its own
// section rather than being dropped), and a single closing gradient-tinted CTA band (the design
// system caps a page at *one* such band). All copy is the existing marketing copy, carried over
// verbatim — this is a visual system change, not a rewrite of what the product says about itself.

const shimmer = keyframes`
  from { background-position: 200% center; }
  to { background-position: -200% center; }
`;

/** Types `text` out at `speedMs` per character — the hero status badge's "boot line". */
function useTypedText(text: string, speedMs = 34): string {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    let i = 0;
    setDisplay('');
    const id = setInterval(() => {
      i += 1;
      setDisplay(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text]);
  return display;
}

// Anchor sections sit under the fixed AppBar (56px mobile / HEADER_HEIGHT desktop) — scroll-
// margin-top keeps a jump-to-section click from landing the heading right under the header.
const ANCHOR_SCROLL_MARGIN = { xs: 56 + 16, md: HEADER_HEIGHT + 16 };

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const eyebrowSx = { ...typeScale.eyebrow, color: 'primary.main', mb: 2 } as const;

const sectionHeadingSx = {
  fontFamily: typeScale.display.fontFamily,
  fontWeight: 700,
  fontSize: { xs: '1.75rem', md: '2.125rem' },
  letterSpacing: '-0.02em',
  color: 'text.primary',
  maxWidth: 640,
} as const;

const cardTitleSx = {
  fontFamily: typeScale.display.fontFamily,
  fontWeight: 700,
  fontSize: '1.1rem',
  color: 'text.primary',
} as const;

/** Small "label value" pill used in the hero mock's WILL LOG illustration — same visual language
 * as `WillLogPreview`'s own chip helper, hand-rolled here since this illustration has no submit
 * action, unlike the real component's clickable "Log it" pill. */
const logChip = (label: string, value: string) => (
  <Box
    key={label}
    sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5, fontSize: 12 }}
  >
    <Box component="span" sx={{ color: 'text.secondary' }}>{label} </Box>
    <Box component="span" sx={{ fontWeight: 700 }}>{value}</Box>
  </Box>
);

/** CerebroOS feature card: surface + hairline border, icon chip in an accent tint circle, title, body. */
const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; body: string; index: number; children?: React.ReactNode }> = ({ icon, title, body, index, children }) => {
  const theme = useTheme();
  return (
    <ScrollReveal index={index}>
      <Box sx={{ ...glassCardSx(theme), p: 3, height: '100%' }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: '11px',
            bgcolor: (t) => withAlpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.15 : 0.1),
            border: '1px solid',
            borderColor: (t) => withAlpha(t.palette.primary.main, 0.35),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
            mb: 2.25,
          }}
        >
          {icon}
        </Box>
        <Typography sx={cardTitleSx}>{title}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, lineHeight: 1.65 }}>{body}</Typography>
        {children && <Box sx={{ mt: 2 }}>{children}</Box>}
      </Box>
    </ScrollReveal>
  );
};

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
  const bootLine = useTypedText('trackspense :: ready — a cerebroos product');

  return (
    <Box sx={{ position: 'relative' }}>
      <AmbientBackground />

      {/* ===== Hero ===== */}
      <PageContainer maxWidth="md" sx={{ pt: { xs: 7, md: 11 }, pb: { xs: 2, md: 3 }, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <ScrollReveal>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <StatusBadge label={bootLine || ' '} tone="cyan" pulse />
          </Box>

          <Typography
            component="h1"
            sx={{
              fontFamily: typeScale.display.fontFamily,
              fontWeight: 700,
              fontSize: { xs: '2.5rem', md: '4rem' },
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              color: 'text.primary',
              maxWidth: 760,
              mx: 'auto',
            }}
          >
            Your money and your groups.{' '}
            <Box
              component="span"
              sx={{
                backgroundImage: `linear-gradient(100deg, ${cerebro.violetAccent}, ${cerebro.cyanAccent}, ${cerebro.violetAccent})`,
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                animation: `${shimmer} 6s linear infinite`,
              }}
            >
              One ledger.
            </Box>
          </Typography>

          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.65, color: 'text.secondary', mt: 3, maxWidth: 520, mx: 'auto' }}>
            Most apps track <em>your</em> spending or <em>shared</em> bills. TrackSpense does both — your share of every split
            automatically joins your personal total, so you always know what this month really cost you.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.5, mt: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button size="large" variant="contained" color="primary" endIcon={<ArrowForwardRoundedIcon />} onClick={goStart}>
              Start tracking — free
            </Button>
            <Button size="large" variant="outlined" color="inherit" onClick={() => scrollToId('how')}>
              See how it works
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 2.5, mt: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Free to use', 'No card required', 'Works with your groups'].map((label) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
              </Box>
            ))}
          </Box>
        </ScrollReveal>
      </PageContainer>

      {/* Browser-chrome screenshot frame — illustrative product mock, mirrors DashboardPage's
          real TrueTotalHero (lens toggle, spend total, "Net with people") plus its "My Groups"
          balance rows. Static values, no live session to fetch on a pre-login marketing page. */}
      <PageContainer maxWidth="md" sx={{ pb: { xs: 8, md: 10 }, position: 'relative', zIndex: 1 }}>
        <ScrollReveal index={1}>
          <Box
            aria-hidden="true"
            sx={{
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              boxShadow: (t) => (t.palette.mode === 'dark'
                ? '0 40px 100px rgba(0,0,0,0.6), 0 0 80px oklch(0.5 0.22 285 / 0.18)'
                : '0 24px 64px rgba(24,24,27,0.12)'),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              {[0, 1, 2].map((i) => (
                <Box key={i} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'divider' }} />
              ))}
              <Typography sx={{ ...typeScale.eyebrow, letterSpacing: '0.06em', color: 'text.secondary', ml: 1.5 }}>trackspense — app</Typography>
            </Box>

            <Box sx={{ p: { xs: 2.5, md: 4 }, bgcolor: 'background.default', display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ width: '100%', maxWidth: 400 }}>
                <SegmentedTabs
                  value="share"
                  onChange={() => { }}
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
                  <Box sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.75, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>🏠 Roommates</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>+$56.80</Typography>
                  </Box>
                  <Box sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.75, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>✈️ Weekend Trip</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>−$27.50</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </ScrollReveal>
      </PageContainer>

      {/* ===== Features ===== */}
      <PageContainer id="features" maxWidth="lg" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: ANCHOR_SCROLL_MARGIN, position: 'relative', zIndex: 1 }}>
        <ScrollReveal>
          <Typography sx={eyebrowSx}>01 / FEATURES</Typography>
          <Typography sx={sectionHeadingSx}>Built for the four things you actually do.</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.975rem', mt: 1.5, maxWidth: 560, lineHeight: 1.6 }}>
            Log it fast. Split it fairly. See who owes what. Settle up. Everything else supports those four.
          </Typography>
        </ScrollReveal>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.25, mt: 5.5 }}>
          <FeatureCard index={0} icon={<BoltRoundedIcon fontSize="small" />} title="Log it in one line" body={'Type “coffee 6.75 at Blue Bottle” — TrackSpense parses the amount, merchant, category, and split. Or snap a receipt and let it read the line items.'}>
            <Box sx={{ bgcolor: (t) => withAlpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.08), border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.75 }}>
              <Typography sx={{ ...typeScale.eyebrow, fontSize: '0.65rem', color: 'primary.main' }}>✨ Will log</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                {logChip('Amount', '$6.75')}
                {logChip('Merchant', 'Blue Bottle')}
                {logChip('Category', 'Dining out')}
              </Box>
            </Box>
          </FeatureCard>

          <FeatureCard index={1} icon={<CallSplitRoundedIcon fontSize="small" />} title="Split without spreadsheets" body="Equal, by shares, or exact amounts — pick the group, TrackSpense does the math and shows your share before you save. Rent, trips, dinners: handled.">
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.75, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Split equally · 4 people · your share <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>$21.05</Box>
              </Typography>
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, flexShrink: 0 }}>Adjust</Typography>
            </Box>
          </FeatureCard>

          <FeatureCard index={2} icon={<PeopleAltRoundedIcon fontSize="small" />} title="One balance per person" body="Stop doing mental math across groups. The People view nets everything you share with someone into one number — and one settlement clears it all.">
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ width: 30, height: 30, borderRadius: '50%', ...gradientCta, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                  SK
                </Box>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
                  Sam K <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· 2 groups</Box>
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>+$62.10</Typography>
              </Box>
              <Box sx={{ px: 1.75, py: 1.25, textAlign: 'center', bgcolor: 'action.hover' }}>
                <Box component="span" sx={{ ...gradientCta, borderRadius: 999, px: 2, py: 0.75, fontSize: '0.75rem', fontWeight: 700, display: 'inline-block' }}>
                  Record Sam paid $62.10
                </Box>
              </Box>
            </Box>
          </FeatureCard>

          <FeatureCard index={3} icon={<InsightsRoundedIcon fontSize="small" />} title="Insights that explain themselves" body={'Not just charts — a “what changed” view that names the category, the merchant, and the reason. Item and merchant breakdowns include your group shares.'}>
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
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.25, mt: 2.25 }}>
          <FeatureCard index={4} icon={<DocumentScannerRoundedIcon fontSize="small" />} title="Receipt scanning" body="Snap it — amount, merchant, and line items are parsed and ready to split." />
          <FeatureCard index={5} icon={<EventRepeatRoundedIcon fontSize="small" />} title="Recurring, watched" body="Rent and subscriptions tracked with due dates and a running monthly total." />
          <FeatureCard index={6} icon={<AutoAwesomeRoundedIcon fontSize="small" />} title="Just tell the AI" body={'Ask the AI Analyst to log an expense in plain English — “Sam paid $40 for groceries, split with Roommates” — and it’s saved. No form, no keypad.'} />
        </Box>
      </PageContainer>

      {/* ===== How it works ===== */}
      <PageContainer id="how" maxWidth="lg" sx={{ py: { xs: 8, md: 9 }, scrollMarginTop: ANCHOR_SCROLL_MARGIN, position: 'relative', zIndex: 1 }}>
        <ScrollReveal>
          <Typography sx={eyebrowSx}>02 / HOW IT WORKS</Typography>
          <Typography sx={sectionHeadingSx}>From "who paid?" to "all settled" in three steps.</Typography>
        </ScrollReveal>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3.5, mt: 5.5 }}>
          {STEPS.map(({ n, title, body }, i) => (
            <ScrollReveal key={n} index={i}>
              <Box sx={{ textAlign: 'center', px: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    ...gradientCta,
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
            </ScrollReveal>
          ))}
        </Box>
      </PageContainer>

      {/* ===== FAQ ===== */}
      <Box id="faq" sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', scrollMarginTop: ANCHOR_SCROLL_MARGIN, position: 'relative', zIndex: 1 }}>
        <PageContainer maxWidth={false} sx={{ maxWidth: 760, mx: 'auto', py: { xs: 8, md: 9 } }}>
          <ScrollReveal>
            <Typography sx={eyebrowSx}>03 / FAQ</Typography>
            <Typography sx={sectionHeadingSx}>Questions, answered.</Typography>
          </ScrollReveal>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 4.5 }}>
            {FAQS.map(({ q, a }, i) => (
              <ScrollReveal key={q} index={i}>
                <Accordion elevation={0} disableGutters sx={{ bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{q}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.65 }}>{a}</Typography>
                  </AccordionDetails>
                </Accordion>
              </ScrollReveal>
            ))}
          </Box>
        </PageContainer>
      </Box>

      {/* ===== Closing CTA band — the one gradient-tinted band per page, always dark regardless
          of page mode (a deliberate spotlight moment, matching the design system's source
          "surface tinted" panel, which has no light-canvas equivalent defined). ===== */}
      <PageContainer maxWidth="lg" sx={{ py: { xs: 8, md: 10 }, position: 'relative', zIndex: 1 }}>
        <ScrollReveal>
          <Box
            sx={{
              borderRadius: 4,
              px: { xs: 3, md: 6 },
              py: { xs: 6, md: 8 },
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: withAlpha(cerebro.violetAccentHexDark, 0.35),
              background: cerebro.surfaceTinted,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: -160,
                left: '50%',
                marginLeft: '-200px',
                width: 400,
                height: 300,
                borderRadius: '50%',
                background: 'radial-gradient(circle, oklch(0.6 0.2 285 / 0.4), transparent 70%)',
                filter: 'blur(30px)',
              }}
            />
            <Typography sx={{ position: 'relative', fontFamily: typeScale.display.fontFamily, fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' }, letterSpacing: '-0.03em', color: cerebro.textPrimaryDark }}>
              Know what this month really cost you.
            </Typography>
            <Typography sx={{ position: 'relative', color: cerebro.textSecondaryDark, fontSize: '0.975rem', mt: 1.75, mx: 'auto', maxWidth: 460, lineHeight: 1.6 }}>
              Free to start. Your groups will thank you at settle-up time.
            </Typography>
            <Box sx={{ position: 'relative', mt: 3.5 }}>
              <Button size="large" variant="contained" color="primary" onClick={goStart}>
                Start tracking — free
              </Button>
            </Box>
          </Box>
        </ScrollReveal>
      </PageContainer>

      <Footer />
    </Box>
  );
};

export default HomePage;
