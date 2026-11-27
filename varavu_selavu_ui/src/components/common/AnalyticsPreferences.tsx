import React from 'react';
import { Alert, Box, Button, Divider, Typography } from '@mui/material';
import FormSheet from './FormSheet';
import { CONSENT_CHANGED, PREFERENCES_OPEN, getStoredConsent, openAnalyticsPreferences, setConsent } from '../../analytics/browser';
import {
  DIAGNOSTICS_CONSENT_CHANGED,
  DIAGNOSTICS_CONSENT_COPY,
  getDiagnosticsConsent,
  setDiagnosticsConsent,
} from '../../analytics/diagnostics';

export function AnalyticsPreferencesButton() {
  return <Button onClick={openAnalyticsPreferences} size="small" sx={{ minHeight: 44 }}>Analytics preferences</Button>;
}

export default function AnalyticsPreferences() {
  const [open, setOpen] = React.useState(false);
  const [storageFailed, setStorageFailed] = React.useState(false);
  const [diagStorageFailed, setDiagStorageFailed] = React.useState(false);
  const [choice, setChoice] = React.useState(getStoredConsent);
  const [diagChoice, setDiagChoice] = React.useState(getDiagnosticsConsent);
  React.useEffect(() => {
    const show = () => {
      setChoice(getStoredConsent());
      setDiagChoice(getDiagnosticsConsent());
      setOpen(true);
    };
    const update = () => setChoice(getStoredConsent());
    const updateDiag = () => setDiagChoice(getDiagnosticsConsent());
    window.addEventListener(PREFERENCES_OPEN, show);
    window.addEventListener(CONSENT_CHANGED, update);
    window.addEventListener(DIAGNOSTICS_CONSENT_CHANGED, updateDiag);
    return () => {
      window.removeEventListener(PREFERENCES_OPEN, show);
      window.removeEventListener(CONSENT_CHANGED, update);
      window.removeEventListener(DIAGNOSTICS_CONSENT_CHANGED, updateDiag);
    };
  }, []);
  const decide = (next: 'granted' | 'denied') => {
    const stored = setConsent(next);
    setStorageFailed(!stored);
    setChoice(getStoredConsent());
    // Stay open if storage failed: do not falsely claim a grant was saved.
    if (stored && getStoredConsent() === next) setOpen(false);
  };
  const decideDiagnostics = (next: 'granted' | 'denied') => {
    const stored = setDiagnosticsConsent(next);
    setDiagStorageFailed(!stored);
    setDiagChoice(getDiagnosticsConsent());
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

    <Divider sx={{ my: 3 }} />
    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
      Performance diagnostics
    </Typography>
    <Typography variant="body2" paragraph>
      {DIAGNOSTICS_CONSENT_COPY}
    </Typography>
    <Typography role="status" variant="body2" color="text.secondary" paragraph>
      {diagChoice === 'granted'
        ? 'Performance diagnostics: enabled.'
        : 'Performance diagnostics: off (default).'}
    </Typography>
    {diagStorageFailed && (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Your browser could not save your performance diagnostics preference. It remains off.
      </Alert>
    )}
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <Button variant="outlined" onClick={() => decideDiagnostics('denied')} sx={{ minHeight: 44 }}>
        Turn off diagnostics
      </Button>
      <Button variant="outlined" onClick={() => decideDiagnostics('granted')} sx={{ minHeight: 44 }}>
        Allow performance diagnostics
      </Button>
    </Box>
  </FormSheet>;
}
