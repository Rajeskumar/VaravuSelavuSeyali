import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { getStoredConsent, grantAnalyticsConsent, denyAnalyticsConsent } from '../../utils/analyticsConsent';

/** Shown pre-decision on every page (including the pre-login landing, where GA4 previously
 * fired unconditionally) until the visitor accepts or declines analytics. Nothing is tracked
 * before a choice is made — see utils/analyticsConsent.ts. */
const ConsentBanner: React.FC = () => {
  const [decided, setDecided] = React.useState(() => getStoredConsent() !== null);

  const bannerRef = React.useRef<HTMLDivElement>(null);

  // The banner is position:fixed, so it used to sit on top of the page's last ~60px (the Ask
  // chat input, footer links, the last row of a list) until answered. Reserve its height as body
  // padding while it's showing so nothing is permanently hidden behind it (WCAG 2.4.11).
  React.useLayoutEffect(() => {
    const el = bannerRef.current;
    if (decided || !el) return;
    const previous = document.body.style.paddingBottom;
    const apply = () => { document.body.style.paddingBottom = `${el.offsetHeight}px`; };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      document.body.style.paddingBottom = previous;
    };
  }, [decided]);

  if (decided) return null;

  const decide = (accept: boolean) => {
    if (accept) grantAnalyticsConsent();
    else denyAnalyticsConsent();
    setDecided(true);
  };

  return (
    <Box
      ref={bannerRef}
      role="region"
      aria-label="Cookie consent"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        // Same layer as drawers (not the snackbar layer it used to use) so an open dialog, sheet or
        // the Ask panel is never overlapped by it; modals render later in the DOM and win the tie.
        zIndex: (t) => t.zIndex.drawer,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        py: 1.5,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.15)',
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>
        We use analytics cookies to understand how TrackSpense is used. See our{' '}
        <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/privacy-policy`} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </Link>.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => decide(false)}>
          Decline
        </Button>
        <Button size="small" variant="contained" onClick={() => decide(true)}>
          Accept
        </Button>
      </Box>
    </Box>
  );
};

export default ConsentBanner;
