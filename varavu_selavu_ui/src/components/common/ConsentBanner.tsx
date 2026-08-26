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

  if (decided) return null;

  const decide = (accept: boolean) => {
    if (accept) grantAnalyticsConsent();
    else denyAnalyticsConsent();
    setDecided(true);
  };

  return (
    <Box
      role="region"
      aria-label="Cookie consent"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.snackbar,
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
