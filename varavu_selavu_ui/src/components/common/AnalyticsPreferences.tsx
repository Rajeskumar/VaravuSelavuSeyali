import React from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import FormSheet from './FormSheet';
import { CONSENT_CHANGED, PREFERENCES_OPEN, getStoredConsent, openAnalyticsPreferences, setConsent } from '../../analytics/browser';

export function AnalyticsPreferencesButton() {
  return <Button onClick={openAnalyticsPreferences} size="small" sx={{ minHeight: 44 }}>Analytics preferences</Button>;
}

export default function AnalyticsPreferences() {
  const [open, setOpen] = React.useState(false);
  const [storageFailed, setStorageFailed] = React.useState(false);
  const [choice, setChoice] = React.useState(getStoredConsent);
  React.useEffect(() => {
    const show = () => { setChoice(getStoredConsent()); setOpen(true); };
    const update = () => setChoice(getStoredConsent());
    window.addEventListener(PREFERENCES_OPEN, show);
    window.addEventListener(CONSENT_CHANGED, update);
    return () => {
      window.removeEventListener(PREFERENCES_OPEN, show);
      window.removeEventListener(CONSENT_CHANGED, update);
    };
  }, []);
  const decide = (next: 'granted' | 'denied') => {
    const stored = setConsent(next);
    setStorageFailed(!stored);
    setChoice(getStoredConsent());
    // Stay open if storage failed: do not falsely claim a grant was saved.
    if (stored && getStoredConsent() === next) setOpen(false);
  };
  return <FormSheet open={open} onClose={() => setOpen(false)} title="Analytics preferences">
    <Typography paragraph>
      Optional analytics helps us understand which pages and features are used. Your expense amounts,
      descriptions, receipts and conversations are not included. You can change your choice here anytime.
    </Typography>
    <Typography role="status" paragraph>
      {choice === 'granted' ? 'Your choice: allow optional analytics.'
        : choice === 'denied' ? 'Your choice: decline optional analytics.'
          : 'Optional analytics is off until you allow it. If your browser blocks storage, it stays off.'}
    </Typography>
    <Typography variant="body2" color="text.secondary" paragraph>
      Turning analytics off may reload this page to stop tracking. Your account and saved expenses are unaffected.
    </Typography>
    {storageFailed && <Alert severity="warning" sx={{ mb: 2 }}>Your browser could not save this preference. Analytics stays off for this page. Allow site storage to save your choice.</Alert>}
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <Button variant="outlined" onClick={() => decide('denied')} sx={{ minHeight: 44 }}>Decline</Button>
      <Button variant="outlined" onClick={() => decide('granted')} sx={{ minHeight: 44 }}>Allow analytics</Button>
    </Box>
  </FormSheet>;
}
