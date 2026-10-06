import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { resendVerification } from '../../api/auth';

interface Props {
  /** Re-checks verification status (e.g. after the user clicked the link in another tab). */
  onCheckAgain?: () => void;
  align?: 'center' | 'left';
}

/** Explains that groups need a verified email and offers Resend — shown where the user would
 * otherwise discover the requirement only as an error after filling in a form. */
const VerifyEmailPrompt: React.FC<Props> = ({ onCheckAgain, align = 'center' }) => {
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const resend = async () => {
    setState('sending');
    try {
      await resendVerification();
      setState('sent');
    } catch {
      setState('error');
    }
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: 1 }}>
      <Typography variant="body2" color={state === 'error' ? 'error' : 'text.secondary'} role="status">
        {state === 'sent'
          ? 'Sent — check your inbox (and spam) for the link, then come back here.'
          : state === 'error'
            ? "Couldn't send the email. Wait a minute and try again."
            : 'Groups need a verified email so the people you split with know it is really you.'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
        <Button variant="contained" size="small" onClick={resend} disabled={state === 'sending' || state === 'sent'}>
          {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Email sent' : 'Resend verification email'}
        </Button>
        {onCheckAgain && (
          <Button variant="text" size="small" onClick={onCheckAgain}>
            I've verified
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default VerifyEmailPrompt;
