import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link } from '@mui/material';
import { onAiConsentRequest, recordAiConsent } from '../../utils/aiConsent';

const POLICY_URL = `${process.env.REACT_APP_API_BASE_URL || ''}/privacy-policy`;

/** Mounted once. Opens when something is about to send data to the AI provider for the first
 * time, and settles every waiting caller with the answer. */
const AiConsentHost: React.FC = () => {
  const waiting = React.useRef<Array<(granted: boolean) => void>>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(
    () =>
      onAiConsentRequest((resolve) => {
        waiting.current.push(resolve);
        setOpen(true);
      }),
    [],
  );

  const settle = (granted: boolean) => {
    recordAiConsent(granted);
    setOpen(false);
    waiting.current.splice(0).forEach((r) => r(granted));
  };

  return (
    <Dialog open={open} onClose={() => settle(false)} maxWidth="xs" fullWidth aria-labelledby="ai-consent-title">
      <DialogTitle id="ai-consent-title">Use AI features?</DialogTitle>
      <DialogContent>
        <DialogContentText component="div" sx={{ fontSize: 14 }}>
          <p style={{ marginTop: 0 }}>
            Ask, receipt scanning and category suggestions send data to <strong>Google's Gemini AI service</strong>, a third party:
          </p>
          <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>
            <li>your question and the expense, budget and group figures needed to answer it (merchants, descriptions, group and member names, balances)</li>
            <li>receipt photos you scan, only when our own reader isn't confident about one</li>
            <li>text you type into a description, to suggest a category</li>
          </ul>
          <p style={{ margin: 0 }}>
            We don't send your password or payment details. You can say no and keep using everything else: receipts are still
            read by our own reader, and categories come from built-in rules.{' '}
            <Link href={POLICY_URL} target="_blank" rel="noopener noreferrer">
              Privacy policy
            </Link>
          </p>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => settle(false)}>Not now</Button>
        <Button variant="contained" onClick={() => settle(true)} autoFocus>
          Allow AI features
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AiConsentHost;
